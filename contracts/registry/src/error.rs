use soroban_sdk::contracterror;

/// Stable error codes. These are part of the ABI: never renumber, never reuse.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SentinelError {
    /// Caller is not the watch owner.
    Unauthorized = 1,
    /// Target contract already has an active watch.
    AlreadyWatched = 2,
    /// No watch record for the given contract.
    NotFound = 3,
    /// The watch exists but was removed; nothing to remove.
    NotWatched = 4,
    /// Warn window outside [MIN_WARN_LEDGERS, MAX_WARN_LEDGERS].
    InvalidWarnWindow = 5,
    /// Checked arithmetic overflowed.
    MathOverflow = 6,
}
