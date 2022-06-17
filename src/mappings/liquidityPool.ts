import {
  DepositProcessed,
  DepositQueued,
  WithdrawProcessed,
  WithdrawQueued,
  WithdrawPartiallyProcessed,
  PoolHedgerUpdated,
  CircuitBreakerUpdated,
  BasePurchased,
  BaseSold,
} from '../../generated/templates/LiquidityPool/LiquidityPool'
import { ShortPoolHedger as PoolHedgerTemplate } from '../../generated/templates'

import { DAY_SECONDS, Entity, HOURLY_PERIODS, Snapshot, ZERO } from '../lib'
import {
  LPPendingAction,
  LPUserLiquidity,
  LPAction,
  Market,
  Pool,
  CircuitBreaker,
} from '../../generated/schema'
import { Address, BigInt, store } from '@graphprotocol/graph-ts'
import { createPoolHedger } from './lyraRegistry'

export function handlePoolHedgerUpdated(event: PoolHedgerUpdated): void {
  PoolHedgerTemplate.create(event.params.poolHedger)
  let pool = Entity.loadPool(event.address) as Pool
  let market = Market.load(pool.market) as Market

  let poolHedger = createPoolHedger(event.params.poolHedger, event.block.timestamp.toI32(), market.id)

  market.poolHedger = poolHedger.id
  poolHedger.market = market.id

  poolHedger.save()
  market.save()
}

////// ////// ////// ////// ////// ////// //////
////// BASE PURCHASED/SOLD FUNCTIONALITY //////
////// ////// ////// ////// ////// //////

export function handleBasePurchased(event: BasePurchased): void {
  let poolId = Entity.getIDFromAddress(event.address)
  let pool = Pool.load(poolId) as Pool

  pool.baseBalance = pool.baseBalance.plus(event.params.baseReceived)
  pool.save()
}

export function handleBaseSold(event: BaseSold): void {
  let poolId = Entity.getIDFromAddress(event.address)
  let pool = Pool.load(poolId) as Pool

  pool.baseBalance = pool.baseBalance.minus(event.params.amountBase)
  pool.save()
}

////// ////// ////// ////// ////// ////// //////
////// DEPOSIT/WITHDRAW FUNCTIONALITY //////
////// ////// ////// ////// ////// //////

export function updatePendingLiquidity(
  poolId: string,
  timestamp: i32,
  depositQueueAmount: BigInt,
  withdrawQueueAmount: BigInt,
): void {
  let pool = Pool.load(poolId) as Pool
  pool.pendingDeposits = pool.pendingDeposits.plus(depositQueueAmount)
  pool.pendingWithdrawals = pool.pendingWithdrawals.plus(withdrawQueueAmount)
  pool.save()
}

export function handleDepositQueued(event: DepositQueued): void {
  let poolId = Entity.getIDFromAddress(event.address)
  if (event.params.depositQueueId.equals(ZERO)) {
    //First deposit comes in with an ID of ZERO, which causes issues. We just dont store the first queued deposit and create a USER LP object
    let lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.beneficiary, poolId)
    lpUserLiquidity.save()
    return
  }
  let timestamp = event.block.timestamp.toI32()

  //LPUserLiquidity might not exist yet if this is a user's first deposit
  let lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.beneficiary, poolId)
  lpUserLiquidity.save()

  let depositQueueId = Entity.getPendingDepositOrWithdrawID(event.address, event.params.depositQueueId, true)

  let queuedDeposit = new LPPendingAction(depositQueueId)
  queuedDeposit.lpUserLiquidity = lpUserLiquidity.id
  queuedDeposit.pool = event.address.toHex()
  queuedDeposit.isDeposit = true
  queuedDeposit.timestamp = timestamp
  queuedDeposit.queueID = event.params.depositQueueId
  queuedDeposit.pendingAmount = event.params.amountDeposited
  queuedDeposit.processedAmount = ZERO
  queuedDeposit.transactionHash = event.transaction.hash

  queuedDeposit.save()

  updatePendingLiquidity(poolId, timestamp, event.params.amountDeposited, ZERO)
}

export function handleDepositProcessed(event: DepositProcessed): void {
  let poolId = Entity.getIDFromAddress(event.address)
  let timestamp = event.block.timestamp.toI32()

  //Update total user deposited amount
  let lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.beneficiary, poolId)
  lpUserLiquidity.totalAmountDeposited = lpUserLiquidity.totalAmountDeposited.plus(event.params.amountDeposited)
  lpUserLiquidity.save()

  let depositId = Entity.getDepositOrWithdrawalID(
    event.address,
    event.params.beneficiary.toHex(),
    event.transaction.hash,
  )

  let deposit = new LPAction(depositId)
  deposit.isDeposit = true
  deposit.pool = event.address.toHex()
  deposit.lpUserLiquidity = lpUserLiquidity.id
  deposit.timestamp = timestamp
  deposit.transactionHash = event.transaction.hash
  deposit.queueID = event.params.depositQueueId
  deposit.quoteAmount = event.params.amountDeposited
  deposit.tokenPrice = event.params.tokenPrice
  deposit.tokenAmount = event.params.tokensReceived

  deposit.save()

  //Remove from deposit queue if the deposit was not immediately processed
  if (event.params.depositQueueId.notEqual(ZERO)) {
    let depositQueueId = Entity.getPendingDepositOrWithdrawID(event.address, event.params.depositQueueId, true)
    store.remove('LPPendingAction', depositQueueId)

    updatePendingLiquidity(poolId, timestamp, event.params.amountDeposited.neg(), ZERO)
  }
}

export function handleWithdrawQueued(event: WithdrawQueued): void {
  if (event.params.withdrawalQueueId.equals(ZERO)) {
    //First withdraw comes in with an ID of ZERO, which causes issues. We just ignore the first withdrawal
    return
  }
  let poolId = Entity.getIDFromAddress(event.address)
  let timestamp = event.block.timestamp.toI32()
  let lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.withdrawer, poolId)

  let withdrawalQueueId = Entity.getPendingDepositOrWithdrawID(event.address, event.params.withdrawalQueueId, false)

  let queuedWithdrawal = new LPPendingAction(withdrawalQueueId)
  queuedWithdrawal.lpUserLiquidity = lpUserLiquidity.id
  queuedWithdrawal.pool = event.address.toHex()
  queuedWithdrawal.isDeposit = false
  queuedWithdrawal.timestamp = timestamp
  queuedWithdrawal.queueID = event.params.withdrawalQueueId
  queuedWithdrawal.pendingAmount = event.params.amountWithdrawn
  queuedWithdrawal.transactionHash = event.transaction.hash

  queuedWithdrawal.save()

  updatePendingLiquidity(poolId, timestamp, ZERO, event.params.amountWithdrawn)
}

export function handleWithdrawProcessed(event: WithdrawProcessed): void {
  let poolId = Entity.getIDFromAddress(event.address)
  let timestamp = event.block.timestamp.toI32()

  let lpUserLiquidity: LPUserLiquidity
  if (event.params.withdrawalQueueId.equals(ZERO)) {
    lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.caller, poolId)
  } else {
    let withdrawalQueueID = Entity.getPendingDepositOrWithdrawID(event.address, event.params.withdrawalQueueId, false)
    let withdrawalQueue = LPPendingAction.load(withdrawalQueueID) as LPPendingAction
    lpUserLiquidity = LPUserLiquidity.load(withdrawalQueue.lpUserLiquidity) as LPUserLiquidity
  }

  lpUserLiquidity.totalAmountWithdrawn = lpUserLiquidity.totalAmountWithdrawn.plus(event.params.amountWithdrawn)
  lpUserLiquidity.save()

  let withdrawID = Entity.getDepositOrWithdrawalID(event.address, lpUserLiquidity.user.toHex(), event.transaction.hash)

  let withdrawal = new LPAction(withdrawID)
  withdrawal.isDeposit = false
  withdrawal.pool = event.address.toHex()
  withdrawal.lpUserLiquidity = lpUserLiquidity.id
  withdrawal.timestamp = timestamp
  withdrawal.transactionHash = event.transaction.hash
  withdrawal.queueID = event.params.withdrawalQueueId
  withdrawal.quoteAmount = event.params.quoteReceived
  withdrawal.tokenPrice = event.params.tokenPrice
  withdrawal.tokenAmount = event.params.amountWithdrawn

  withdrawal.save()

  //Remove from withdraw queue if the deposit was not immediately processed
  if (event.params.withdrawalQueueId.notEqual(ZERO)) {
    updatePendingLiquidity(poolId, timestamp, ZERO, event.params.amountWithdrawn.neg())
    let withdrawalQueueID = Entity.getPendingDepositOrWithdrawID(event.address, event.params.withdrawalQueueId, false)
    store.remove('LPPendingAction', withdrawalQueueID)
  }
}

export function handleWithdrawPartiallyProcessed(event: WithdrawPartiallyProcessed): void {
  let poolId = Entity.getIDFromAddress(event.address)
  let timestamp = event.block.timestamp.toI32()

  let lpUserLiquidity: LPUserLiquidity
  if (event.params.withdrawalQueueId.equals(ZERO)) {
    lpUserLiquidity = createOrLoadLPUserLiquidity(event.address, event.params.caller, poolId)
  } else {
    let withdrawalQueueID = Entity.getPendingDepositOrWithdrawID(event.address, event.params.withdrawalQueueId, false)
    let withdrawalQueue = LPPendingAction.load(withdrawalQueueID) as LPPendingAction
    lpUserLiquidity = LPUserLiquidity.load(withdrawalQueue.lpUserLiquidity) as LPUserLiquidity
  }

  lpUserLiquidity.totalAmountWithdrawn = lpUserLiquidity.totalAmountWithdrawn.plus(event.params.amountWithdrawn)
  lpUserLiquidity.save()

  let withdrawID = Entity.getDepositOrWithdrawalID(event.address, lpUserLiquidity.user.toHex(), event.transaction.hash)

  let withdrawal = new LPAction(withdrawID)
  withdrawal.isDeposit = false
  withdrawal.pool = event.address.toHex()
  withdrawal.lpUserLiquidity = lpUserLiquidity.id
  withdrawal.timestamp = timestamp
  withdrawal.transactionHash = event.transaction.hash
  withdrawal.queueID = event.params.withdrawalQueueId
  withdrawal.quoteAmount = event.params.quoteReceived
  withdrawal.tokenPrice = event.params.tokenPrice
  withdrawal.tokenAmount = event.params.amountWithdrawn

  withdrawal.save()

  //Update WithdrawalQueue entity to reflect new pending amount
  let withdrawalQueueID = Entity.getPendingDepositOrWithdrawID(event.address, event.params.withdrawalQueueId, false)
  let lpPendingWithdrawal = LPPendingAction.load(withdrawalQueueID) as LPPendingAction
  lpPendingWithdrawal.processedAmount = lpPendingWithdrawal.processedAmount.plus(event.params.amountWithdrawn)
  lpPendingWithdrawal.pendingAmount = lpPendingWithdrawal.pendingAmount.minus(event.params.amountWithdrawn)
  lpPendingWithdrawal.save()

  if (event.params.withdrawalQueueId.notEqual(ZERO)) {
    updatePendingLiquidity(poolId, timestamp, ZERO, event.params.amountWithdrawn.neg())
  }
}

export function createOrLoadLPUserLiquidity(
  poolAddress: Address,
  userAddress: Address,
  poolId: string,
): LPUserLiquidity {
  let lpUserLiquidityID = Entity.getLPUserLiquidityID(poolAddress, userAddress)
  let lpUserLiquidity = LPUserLiquidity.load(lpUserLiquidityID)

  if (lpUserLiquidity == null) {
    lpUserLiquidity = new LPUserLiquidity(lpUserLiquidityID)
    lpUserLiquidity.pool = poolId
    lpUserLiquidity.user = userAddress
    lpUserLiquidity.totalAmountDeposited = ZERO
    lpUserLiquidity.totalAmountWithdrawn = ZERO
  }

  return lpUserLiquidity as LPUserLiquidity
}

////// ////// ////// ////// ////// ////// //////
////// CIRCUIT BREAKER FUNCTIONALITY //////
////// ////// ////// ////// ////// //////

export function handleCircuitBreakerUpdated(event: CircuitBreakerUpdated): void {
  let circuitBreaker = new CircuitBreaker(Entity.getCircuitBreakerID(event.address, event.transaction.hash))

  circuitBreaker.timestamp = event.block.timestamp.toI32()
  circuitBreaker.transactionHash = event.transaction.hash
  circuitBreaker.pool = Entity.getIDFromAddress(event.address)
  circuitBreaker.cbTimestamp = event.params.newTimestamp.toI32()
  circuitBreaker.ivVarianceCrossed = event.params.ivVarianceThresholdCrossed
  circuitBreaker.skewVarianceCrossed = event.params.skewVarianceThresholdCrossed
  circuitBreaker.liquidityVarianceCrossed = event.params.liquidityThresholdCrossed

  circuitBreaker.save()
}
