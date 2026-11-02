use soroban_sdk::{contractevent, Address, Env};

/// Emitted when a contract joins the watchlist.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WatchAdded {
    pub id: u64,
    pub target: Address,
    pub owner: Address,
    pub warn_ledgers: u32,
}

/// Emitted when a watch is removed. The id is not reused.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WatchRemoved {
    pub target: Address,
    pub owner: Address,
}

pub fn emit_watch_added(env: &Env, watch: &crate::types::Watch) {
    env.events().publish_event(&WatchAdded {
        id: watch.id,
        target: watch.target.clone(),
        owner: watch.owner.clone(),
        warn_ledgers: watch.warn_ledgers,
    });
}

pub fn emit_watch_removed(env: &Env, target: &Address, owner: &Address) {
    env.events().publish_event(&WatchRemoved {
        target: target.clone(),
        owner: owner.clone(),
    });
}
