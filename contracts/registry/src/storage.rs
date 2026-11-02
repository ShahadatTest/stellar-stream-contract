use soroban_sdk::{Address, Env};

use crate::types::{DataKey, Watch};

// Soroban state has a limited lifetime: every entry carries a TTL, and when it
// runs out the entry is archived. A contract whose *instance* is archived
// cannot be invoked at all until someone restores it, so the registry extends
// its own TTL aggressively on every read and write.
//
// 17,280 ledgers ~= 1 day, 518,400 ledgers ~= 30 days at 5s per ledger.
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND: u32 = 518_400;
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_EXTEND: u32 = 518_400;

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
}

fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
}

fn get_persistent<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
) -> Option<T> {
    env.storage().persistent().get(key)
}

// --- Instance: id allocation and counters ---

pub fn get_next_id(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
}

pub fn set_next_id(env: &Env, id: u64) {
    env.storage().instance().set(&DataKey::NextId, &id);
    extend_instance_ttl(env);
}

pub fn get_active_count(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::ActiveCount)
        .unwrap_or(0)
}

pub fn set_active_count(env: &Env, count: u64) {
    env.storage().instance().set(&DataKey::ActiveCount, &count);
    extend_instance_ttl(env);
}

// --- Persistent: watches ---

pub fn get_watch(env: &Env, target: &Address) -> Option<Watch> {
    let key = DataKey::Watch(target.clone());
    let watch: Option<Watch> = get_persistent(env, &key);
    if watch.is_some() {
        extend_persistent_ttl(env, &key);
    }
    watch
}

pub fn get_watch_by_id(env: &Env, id: u64) -> Option<Watch> {
    let id_key = DataKey::Target(id);
    let target: Option<Address> = get_persistent(env, &id_key);
    match target {
        Some(target) => get_watch(env, &target),
        None => None,
    }
}

pub fn set_watch(env: &Env, watch: &Watch) {
    let watch_key = DataKey::Watch(watch.target.clone());
    let id_key = DataKey::Target(watch.id);
    let of_key = DataKey::IdOf(watch.target.clone());

    env.storage().persistent().set(&watch_key, watch);
    env.storage().persistent().set(&id_key, &watch.target);
    env.storage().persistent().set(&of_key, &watch.id);

    extend_persistent_ttl(env, &watch_key);
    extend_persistent_ttl(env, &id_key);
    extend_persistent_ttl(env, &of_key);
    extend_instance_ttl(env);
}
