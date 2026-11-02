extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

use crate::error::SentinelError;
use crate::types::{MAX_WARN_LEDGERS, MIN_WARN_LEDGERS};
use crate::{SentinelRegistry, SentinelRegistryClient};

const WARN_30_DAYS: u32 = 518_400;

fn setup<'a>() -> (Env, SentinelRegistryClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(SentinelRegistry, ());
    let client = SentinelRegistryClient::new(&env, &contract_id);
    (env, client)
}

fn label(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

#[test]
fn watch_stores_record_and_returns_id() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    let target = Address::generate(&env);
    env.ledger().set_sequence_number(1_234);

    let id = client.watch(&owner, &target, &label(&env, "payroll"), &WARN_30_DAYS);

    assert_eq!(id, 0);
    assert!(client.is_watched(&target));
    assert_eq!(client.count(), 1);
    assert_eq!(client.active_count(), 1);

    let watch = client.get(&target);
    assert_eq!(watch.id, 0);
    assert_eq!(watch.owner, owner);
    assert_eq!(watch.target, target);
    assert_eq!(watch.warn_ledgers, WARN_30_DAYS);
    assert_eq!(watch.added_ledger, 1_234);
    assert!(watch.active);
    assert_eq!(watch.label, label(&env, "payroll"));
}

#[test]
fn duplicate_active_watch_is_rejected() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    let target = Address::generate(&env);

    client.watch(&owner, &target, &label(&env, "a"), &WARN_30_DAYS);
    let err = client
        .try_watch(&owner, &target, &label(&env, "b"), &WARN_30_DAYS)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, SentinelError::AlreadyWatched);
}

#[test]
fn warn_window_is_bounded() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    let target = Address::generate(&env);

    let too_small = client
        .try_watch(&owner, &target, &label(&env, "a"), &(MIN_WARN_LEDGERS - 1))
        .unwrap_err()
        .unwrap();
    assert_eq!(too_small, SentinelError::InvalidWarnWindow);

    let too_large = client
        .try_watch(&owner, &target, &label(&env, "a"), &(MAX_WARN_LEDGERS + 1))
        .unwrap_err()
        .unwrap();
    assert_eq!(too_large, SentinelError::InvalidWarnWindow);

    // Boundaries themselves are valid.
    client.watch(&owner, &target, &label(&env, "min"), &MIN_WARN_LEDGERS);
    let other = Address::generate(&env);
    client.watch(&owner, &other, &label(&env, "max"), &MAX_WARN_LEDGERS);
}

#[test]
fn unwatch_marks_inactive_and_frees_the_target() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    let target = Address::generate(&env);

    client.watch(&owner, &target, &label(&env, "a"), &WARN_30_DAYS);
    client.unwatch(&owner, &target);

    assert!(!client.is_watched(&target));
    assert_eq!(client.active_count(), 0);
    assert_eq!(client.count(), 1, "ids are not rewound");

    let record = client.get(&target);
    assert!(!record.active);

    let second = client.try_unwatch(&owner, &target).unwrap_err().unwrap();
    assert_eq!(second, SentinelError::NotWatched);

    // Re-registering creates a fresh id.
    let id = client.watch(&owner, &target, &label(&env, "a again"), &WARN_30_DAYS);
    assert_eq!(id, 1);
    assert!(client.is_watched(&target));
    assert_eq!(client.active_count(), 1);
}

#[test]
fn only_the_owner_can_unwatch() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let target = Address::generate(&env);

    client.watch(&owner, &target, &label(&env, "a"), &WARN_30_DAYS);
    let err = client.try_unwatch(&stranger, &target).unwrap_err().unwrap();
    assert_eq!(err, SentinelError::Unauthorized);
}

#[test]
fn unknown_target_is_not_found() {
    let (env, client) = setup();
    let target = Address::generate(&env);

    assert!(!client.is_watched(&target));
    let err = client.try_get(&target).unwrap_err().unwrap();
    assert_eq!(err, SentinelError::NotFound);
    let err = client
        .try_unwatch(&Address::generate(&env), &target)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, SentinelError::NotFound);
}

#[test]
fn list_pages_in_id_order_and_skips_removed() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    let targets: std::vec::Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    for (i, target) in targets.iter().enumerate() {
        client.watch(&owner, target, &label(&env, "t"), &WARN_30_DAYS);
        assert_eq!(client.count(), i as u64 + 1);
    }

    client.unwatch(&owner, &targets[1]);
    client.unwatch(&owner, &targets[3]);

    let all = client.list(&0, &50);
    assert_eq!(all.len(), 3);
    assert_eq!(all.get(0).unwrap().id, 0);
    assert_eq!(all.get(1).unwrap().id, 2);
    assert_eq!(all.get(2).unwrap().id, 4);

    let first_page = client.list(&0, &2);
    assert_eq!(first_page.len(), 2);
    assert_eq!(first_page.get(0).unwrap().id, 0);
    assert_eq!(first_page.get(1).unwrap().id, 2);

    // Cursor 2 covers ids 2, 3, 4: 3 was removed, so 2 and 4 remain.
    let second_page = client.list(&2, &2);
    assert_eq!(second_page.len(), 2);
    assert_eq!(second_page.get(0).unwrap().id, 2);
    assert_eq!(second_page.get(1).unwrap().id, 4);

    // A cursor past the end yields an empty page, not an error.
    assert_eq!(client.list(&99, &10).len(), 0);
}

#[test]
fn list_caps_the_page_size() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    for _ in 0..55 {
        let target = Address::generate(&env);
        client.watch(&owner, &target, &label(&env, "t"), &WARN_30_DAYS);
    }
    assert_eq!(client.list(&0, &1_000).len(), 50);
    assert_eq!(client.list(&0, &0).len(), 50);
}

#[test]
#[should_panic]
fn watch_requires_the_owner_signature() {
    // No mock_all_auths: require_auth must fail.
    let env = Env::default();
    let contract_id = env.register(SentinelRegistry, ());
    let client = SentinelRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let target = Address::generate(&env);
    client.watch(&owner, &target, &label(&env, "a"), &WARN_30_DAYS);
}
