use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    NextStreamId,
    Stream(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub deposit_amount: i128,
    pub start_time: u64,
    pub stop_time: u64,
    pub remaining_balance: i128,
    pub recipient_withdrawn: i128,
    pub is_canceled: bool,
    pub cancelable: bool,
}
