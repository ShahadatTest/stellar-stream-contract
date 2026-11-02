#![no_std]

//! # Soroban Sentinel Registry
//!
//! A public, permissionless watchlist of Soroban contracts whose operators want
//! their state-archival deadline tracked.
//!
//! Soroban releases every storage entry after its TTL elapses. A contract whose
//! instance entry is archived stops accepting calls entirely — funds and
//! balances held by it are frozen until somebody submits a `RestoreFootprint`
//! operation. Nothing on-chain warns an operator that this is about to happen.
//!
//! This contract is the on-chain half of [Soroban
//! Sentinel](https://github.com/Streams-Hq/soroban-sentinel): projects register
//! the contracts they care about, and the off-chain keeper
//! (`sentinel scan`) turns the list into `liveUntilLedgerSeq` readings, expiry
//! forecasts and CI gates.
//!
//! Design rules:
//! - No admin, no upgrade authority, no fees. Anyone can add a contract to the
//!   watchlist and only the owner can remove it.
//! - Ids are monotonic and never reused, so `Target(id)` is a stable index for
//!   keyset pagination.
//! - Every read and write extends the registry's own TTL. The registry must
//!   never become the thing that expires.

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

pub mod error;
pub mod events;
pub mod storage;
pub mod types;

#[cfg(test)]
mod test;

use crate::error::SentinelError;
use crate::types::{Watch, MAX_PAGE, MAX_WARN_LEDGERS, MIN_WARN_LEDGERS};

#[contract]
pub struct SentinelRegistry;

#[contractimpl]
impl SentinelRegistry {
    /// Add `target` to the watchlist. The `owner` must authorize.
    ///
    /// Returns the new watch id. Re-registering a contract that was previously
    /// removed creates a fresh id; ids are never reused.
    pub fn watch(
        env: Env,
        owner: Address,
        target: Address,
        label: String,
        warn_ledgers: u32,
    ) -> Result<u64, SentinelError> {
        owner.require_auth();

        if !(MIN_WARN_LEDGERS..=MAX_WARN_LEDGERS).contains(&warn_ledgers) {
            return Err(SentinelError::InvalidWarnWindow);
        }

        if let Some(existing) = storage::get_watch(&env, &target) {
            if existing.active {
                return Err(SentinelError::AlreadyWatched);
            }
        }

        let id = storage::get_next_id(&env);
        let next_id = id.checked_add(1).ok_or(SentinelError::MathOverflow)?;
        storage::set_next_id(&env, next_id);

        let active = storage::get_active_count(&env);
        let next_active = active.checked_add(1).ok_or(SentinelError::MathOverflow)?;
        storage::set_active_count(&env, next_active);

        let watch = Watch {
            id,
            target: target.clone(),
            owner: owner.clone(),
            label,
            warn_ledgers,
            added_ledger: env.ledger().sequence(),
            active: true,
        };
        storage::set_watch(&env, &watch);

        events::emit_watch_added(&env, &watch);

        Ok(id)
    }

    /// Remove a contract from the watchlist. Only the registering `owner` may
    /// do this. The record is kept (with `active = false`) so ids stay stable.
    pub fn unwatch(env: Env, owner: Address, target: Address) -> Result<(), SentinelError> {
        owner.require_auth();

        let mut watch = storage::get_watch(&env, &target).ok_or(SentinelError::NotFound)?;

        if watch.owner != owner {
            return Err(SentinelError::Unauthorized);
        }
        if !watch.active {
            return Err(SentinelError::NotWatched);
        }

        watch.active = false;
        storage::set_watch(&env, &watch);

        let active = storage::get_active_count(&env);
        let next_active = active.checked_sub(1).ok_or(SentinelError::MathOverflow)?;
        storage::set_active_count(&env, next_active);

        events::emit_watch_removed(&env, &target, &owner);

        Ok(())
    }

    /// Read the watch record for a contract, including inactive ones.
    pub fn get(env: Env, target: Address) -> Result<Watch, SentinelError> {
        storage::extend_instance_ttl(&env);
        storage::get_watch(&env, &target).ok_or(SentinelError::NotFound)
    }

    /// True when the contract has an active watch.
    pub fn is_watched(env: Env, target: Address) -> bool {
        storage::extend_instance_ttl(&env);
        storage::get_watch(&env, &target)
            .map(|w| w.active)
            .unwrap_or(false)
    }

    /// Page through active watches by id.
    ///
    /// `cursor` is the id to start at (0 for the first page); the result is
    /// capped at [`MAX_PAGE`] entries. Ids of removed watches are skipped, so a
    /// page may contain fewer than `limit` items even when more remain.
    pub fn list(env: Env, cursor: u64, limit: u32) -> Vec<Watch> {
        storage::extend_instance_ttl(&env);

        let capped = if limit == 0 || limit > MAX_PAGE {
            MAX_PAGE
        } else {
            limit
        };
        let next_id = storage::get_next_id(&env);
        let mut out: Vec<Watch> = Vec::new(&env);

        let mut id = cursor;
        while id < next_id && out.len() < capped {
            if let Some(watch) = storage::get_watch_by_id(&env, id) {
                if watch.active {
                    out.push_back(watch);
                }
            }
            id += 1;
        }

        out
    }

    /// Number of watches ever created (the next id to be assigned).
    pub fn count(env: Env) -> u64 {
        storage::extend_instance_ttl(&env);
        storage::get_next_id(&env)
    }

    /// Number of currently active watches.
    pub fn active_count(env: Env) -> u64 {
        storage::extend_instance_ttl(&env);
        storage::get_active_count(&env)
    }
}
