use soroban_sdk::{contracttype, Address, String};

/// A watch must be able to warn at least ~1 day ahead (17,280 ledgers at 5s).
pub const MIN_WARN_LEDGERS: u32 = 17_280;
/// One year of ledgers at 5s per ledger. The network caps entry TTL well below
/// this, so this is an upper bound on policy, not on storage.
pub const MAX_WARN_LEDGERS: u32 = 6_307_200;
/// Maximum number of watches returned by a single `list` call.
pub const MAX_PAGE: u32 = 50;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Instance: next watch id to assign.
    NextId,
    /// Instance: number of active watches.
    ActiveCount,
    /// Persistent: watch id -> target contract (for pagination).
    Target(u64),
    /// Persistent: target contract -> watch id.
    IdOf(Address),
    /// Persistent: target contract -> watch record.
    Watch(Address),
}

/// A single entry in the public watchlist.
///
/// The watchlist is deliberately address-only: a contract can only extend the
/// TTL of storage it owns, so the on-chain record is the *declaration* of what
/// matters. Off-chain keepers use it as the canonical list of contracts to
/// monitor and page operators on.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Watch {
    pub id: u64,
    /// The Soroban contract being watched.
    pub target: Address,
    /// The account that registered the watch and may remove it.
    pub owner: Address,
    /// Human-readable name, e.g. "USDC payroll stream v2".
    pub label: String,
    /// Warn when fewer than this many ledgers remain before archival.
    pub warn_ledgers: u32,
    /// Ledger sequence at registration time.
    pub added_ledger: u32,
    /// False once removed. Ids are never reused.
    pub active: bool,
}
