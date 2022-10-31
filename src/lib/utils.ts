import { Address, BigInt, ethereum, log, Bytes } from '@graphprotocol/graph-ts'
import { GLOBAL_ID, Snapshot, ZERO_ADDRESS } from '.'
import {
  Market,
  Pool,
  GreekCache,
  OptionMarketPricer,
  ShortCollateral,
  Board,
  Option,
  MarketVolumeAndFeesSnapshot,
  Global,
  BoardBaseIVSnapshot,
  StrikeIVAndGreeksSnapshot,
  OptionPriceAndGreeksSnapshot,
  OptionVolumeSnapshot,
  MarketGreeksSnapshot,
  PoolHedgerExposureSnapshot,
  Position,
  OptionToken,
  CollateralUpdate,
  SpotPriceSnapshot,
  Strike,
  MarketTotalValueSnapshot,
  MarketSNXFeesSnapshot,
  //User
} from '../../generated/schema'

export let ZERO = BigInt.fromI32(0)
export let ONE = BigInt.fromI32(1)
export let UNIT = BigInt.fromString('1' + '0'.repeat(18))
export let UNITDECIMAL = UNIT.toBigDecimal()

export let FIVE_MINUTE_SECONDS: i32 = 300
export let FIFTEEN_MINUTE_SECONDS: i32 = FIVE_MINUTE_SECONDS * 3
export let HOUR_SECONDS: i32 = FIFTEEN_MINUTE_SECONDS * 4
export let SIX_HOUR_SECONDS: i32 = HOUR_SECONDS * 6
export let DAY_SECONDS: i32 = 86400

//THESE MUST BE IN ASCENDING ORDER
//LARGER PERIODS MUST BE A MULTIPLE OF SMALLER PERIODS
//export let PERIODS: i32[] = [FIFTEEN_MINUTE_SECONDS, HOUR_SECONDS, DAY_SECONDS]
export let HOURLY_PERIODS: i32[] = [HOUR_SECONDS, SIX_HOUR_SECONDS, DAY_SECONDS]
export let CANDLE_PERIODS: i32[] = [
  DAY_SECONDS * 7, //7d
  DAY_SECONDS, //1d
  HOUR_SECONDS * 8, //8h
  HOUR_SECONDS * 4, //4h
  HOUR_SECONDS, //1h
  FIFTEEN_MINUTE_SECONDS, //15m
]

export namespace Entity {
  export function loadOrCreateGlobal(): Global {
    let global = Global.load(GLOBAL_ID)
    if (global == null) {
      global = new Global(GLOBAL_ID)
    }
    return global as Global
  }

  export enum PositionState {
    EMPTY,
    ACTIVE,
    CLOSED,
    LIQUIDATED,
    SETTLED,
    MERGED,
  }

  enum TradeType {
    LongCall,
    LongPut,
    ShortCallBase,
    ShortCallQuote,
    ShortPutQuote,
  }

  export function getIsCall(tradeType: TradeType): boolean {
    return (
      tradeType === TradeType.LongCall ||
      tradeType === TradeType.ShortCallBase ||
      tradeType === TradeType.ShortCallQuote
    )
  }

  export function getIsLong(tradeType: TradeType): boolean {
    return tradeType === TradeType.LongCall || tradeType === TradeType.LongPut
  }

  export function getIsBaseCollateralized(tradeType: TradeType): boolean {
    return tradeType === TradeType.ShortCallBase
  }

  export function getIDFromAddress(optionMarketAddress: Address): string {
    return optionMarketAddress.toHex()
  }

  export function loadMarket(optionMarketAddress: Address): Market {
    return Market.load(getIDFromAddress(optionMarketAddress)) as Market
  }

  export function loadBoard(optionMarketId: string, boardId: BigInt): Board {
    return Board.load(Entity.getBoardID(optionMarketId, boardId)) as Board
  }

  export function loadStrike(optionMarketId: string, strikeId: BigInt): Strike {
    return Strike.load(Entity.getStrikeID(optionMarketId, strikeId)) as Strike
  }

  export function loadPosition(optionMarketId: string, positionId: i32): Position {
    return Position.load(Entity.getPositionID(optionMarketId, positionId)) as Position
  }

  export function loadPool(liquidityPoolAddress: Address): Pool {
    return Pool.load(getIDFromAddress(liquidityPoolAddress)) as Pool
  }

  export function loadGreekCache(greekCacheAddress: Address): GreekCache {
    return GreekCache.load(getIDFromAddress(greekCacheAddress)) as GreekCache
  }

  export function loadOptionToken(optionTokenAddress: Address): OptionToken {
    return OptionToken.load(getIDFromAddress(optionTokenAddress)) as OptionToken
  }

  export function loadOptionMarketPricer(optionMarketPricerAddress: Address): OptionMarketPricer {
    return OptionMarketPricer.load(getIDFromAddress(optionMarketPricerAddress)) as OptionMarketPricer
  }

  export function loadShortCollateral(shortCollateralAddress: Address): ShortCollateral {
    return ShortCollateral.load(getIDFromAddress(shortCollateralAddress)) as ShortCollateral
  }

  // export function getSnapshotID(baseId: string, timestamp: i32): string {
  //   return baseId + '-' + timestamp.toString()
  // }

  export function getBoardID(optionMarketId: string, boardId: BigInt): string {
    return optionMarketId + '-' + boardId.toString()
  }

  export function getStrikeID(optionMarketId: string, strikeId: BigInt): string {
    return optionMarketId + '-' + strikeId.toString()
  }

  export function getOptionID(optionMarketId: string, strikeId: BigInt, isCall: boolean): string {
    let suffix = (isCall ? 'call' : 'put') as string
    return getStrikeID(optionMarketId, strikeId) + '-' + suffix
  }

  export function getOptionIDFromStrikeID(strikeId: string, isCall: boolean): string {
    let suffix = (isCall ? 'call' : 'put') as string
    return strikeId + '-' + suffix
  }

  export function loadOption(optionMarketId: string, strikeId: BigInt, isCall: boolean): Option | null {
    return Option.load(getOptionID(optionMarketId, strikeId, isCall))
  }

  export function getPositionID(optionMarketId: string, positionId: i32): string {
    return optionMarketId + '-' + positionId.toString()
  }

  export function getCollateralUpdateID(optionMarketId: string, positionId: i32, txHash: Bytes): string {
    return optionMarketId + '-' + positionId.toString() + '-' + txHash.toHex()
  }

  export function getTradeIDFromPositionID(positionId: string, txHash: Bytes): string {
    return positionId.toString() + '-' + txHash.toHex()
  }

  export function getPendingDepositOrWithdrawID(lpAddress: Address, positionId: BigInt, isDeposit: boolean): string {
    let depOrWith = isDeposit ? 'deposit' : 'withdraw'
    return lpAddress.toHex() + '-' + depOrWith + '-' + positionId.toString()
  }

  export function getDepositOrWithdrawalID(lpAddress: Address, userAddress: string, txHash: Bytes): string {
    return lpAddress.toHex() + '-' + userAddress + '-' + txHash.toHex()
  }

  export function getLPUserLiquidityID(poolAddress: Address, userAddress: Address): string {
    return poolAddress.toHex() + '-' + userAddress.toHex()
  }

  export function getCircuitBreakerID(poolAddress: Address, txHash: Bytes): string {
    return poolAddress.toHex() + '-' + txHash.toHex()
  }

  export function getTransferID(optionMarketId: string, positionId: i32, txHash: Bytes): string {
    return optionMarketId + '-' + positionId.toString() + '-' + txHash.toHex()
  }

  // export function loadOrCreateUser(
  //   userId: string,
  //   timestamp: i32,
  //   blockNumber: i32
  // ): User {
  //   let user = User.load(userId) //as Position

  //   if (user == null) {
  //     user = new User(userId)
  //     user.firstTradeTimestamp = timestamp
  //     user.firstTradeBlock = blockNumber
  //     user.notionalVolume = ZERO
  //     user.premiumVolume = ZERO
  //     user.profitAndLoss = ZERO
  //     user.tradeCount = 0
  //   }

  //   return user as User
  // }

  export function loadOrCreatePosition(
    optionMarketId: string,
    positionId_: i32,
    timestamp: i32,
    traderAddress: Address,
  ): Position {
    let positionId = Entity.getPositionID(optionMarketId, positionId_)
    let position = Position.load(positionId) //as Position

    if (position == null) {
      position = new Position(positionId)
      position.market = optionMarketId
      position.positionId = positionId_
      position.state = Entity.PositionState.ACTIVE
      position.openTimestamp = timestamp
      position.owner = traderAddress
      position.size = ZERO
      position.collateral = ZERO
      position.averageCostPerOption = ZERO
      position.closePNL = ZERO
      position.collateralPNL = ZERO
      position.averageCollateralSpotPrice = ZERO
    }

    return position as Position
  }

  export function loadOrCreatePositionCollateralUpdate(
    optionMarketId: string,
    positionId_: i32,
    txHash: Bytes,
    timestamp: i32,
    blockNumber: i32,
  ): CollateralUpdate {
    let collateralUpdateId = Entity.getCollateralUpdateID(optionMarketId, positionId_, txHash)
    let collateralUpdate = CollateralUpdate.load(collateralUpdateId)

    if (collateralUpdate == null) {
      collateralUpdate = new CollateralUpdate(collateralUpdateId)
      collateralUpdate.position = Entity.getPositionID(optionMarketId, positionId_)
      collateralUpdate.timestamp = timestamp
      collateralUpdate.transactionHash = txHash
      collateralUpdate.blockNumber = blockNumber
    }

    return collateralUpdate as CollateralUpdate
  }

  export function loadOrCreatePoolHedgerSnapshot(
    poolHedgerAddress: Address,
    optionMarketId: string,
    period: i32,
    timestamp: i32,
  ): PoolHedgerExposureSnapshot {
    let snapshotId = Snapshot.getSnapshotID(getIDFromAddress(poolHedgerAddress), period, timestamp)
    let snapshot = PoolHedgerExposureSnapshot.load(snapshotId)

    if (snapshot == null) {
      // create snapshot
      snapshot = new PoolHedgerExposureSnapshot(snapshotId)
      let poolHedgerId = Entity.getIDFromAddress(poolHedgerAddress)
      snapshot.poolHedger = poolHedgerId
      snapshot.period = period
      snapshot.market = optionMarketId
      snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
      snapshot.currentNetDelta = ZERO
    }
    snapshot.blockTimestamp = timestamp

    return snapshot as PoolHedgerExposureSnapshot
  }

  export function createSpotPriceSnapshot(
    optionMarketId_: string,
    period: i32,
    timestamp: i32,
    blockNumber: i32,
  ): SpotPriceSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionMarketId_, period, timestamp)
    let snapshot = new SpotPriceSnapshot(snapshotId)
    snapshot.market = optionMarketId_
    snapshot.period = period
    snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    snapshot.blockNumber = blockNumber
    snapshot.blockTimestamp = timestamp

    return snapshot as SpotPriceSnapshot
  }

  export function loadOrCreateMarketTotalValueSnapshot(
    optionMarketId: string,
    period: i32,
    timestamp: i32,
  ): MarketTotalValueSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionMarketId, period, timestamp)
    let snapshot = MarketTotalValueSnapshot.load(snapshotId)

    if (snapshot == null) {
      snapshot = new MarketTotalValueSnapshot(snapshotId)
      snapshot.market = optionMarketId
      snapshot.period = period
      snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    }
    snapshot.blockTimestamp = timestamp
    return snapshot
  }

  export function loadOrCreateMarketVolumeAndFeesSnapshot(
    optionMarketId: string,
    period: i32,
    timestamp: i32,
  ): MarketVolumeAndFeesSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionMarketId, period, timestamp)
    let snapshot = MarketVolumeAndFeesSnapshot.load(snapshotId)

    if (snapshot == null) {
      // create snapshot
      snapshot = new MarketVolumeAndFeesSnapshot(snapshotId)

      snapshot.market = optionMarketId
      snapshot.period = period
      snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)

      let market = Market.load(optionMarketId)
      let lastSnapshot: MarketVolumeAndFeesSnapshot | null =
        market == null ? null : MarketVolumeAndFeesSnapshot.load(market.latestVolumeAndFees)

      //Per-period values (Reset to 0 every new snapshot)
      snapshot.premiumVolume = ZERO
      snapshot.notionalVolume = ZERO
      snapshot.spotPriceFees = ZERO
      snapshot.optionPriceFees = ZERO
      snapshot.vegaFees = ZERO
      snapshot.varianceFees = ZERO
      snapshot.deltaCutoffFees = ZERO
      snapshot.liquidatorFees = ZERO
      snapshot.smLiquidationFees = ZERO
      snapshot.lpLiquidationFees = ZERO

      //Cumulative values load from previous snapshot if it exists, otherwise set to 0
      if (lastSnapshot == null) {
        snapshot.totalLongCallOpenInterest = ZERO
        snapshot.totalShortCallOpenInterest = ZERO
        snapshot.totalLongPutOpenInterest = ZERO
        snapshot.totalShortPutOpenInterest = ZERO
        snapshot.totalLongCallOpenInterestUSD = ZERO
        snapshot.totalShortCallOpenInterestUSD = ZERO
        snapshot.totalLongPutOpenInterestUSD = ZERO
        snapshot.totalShortPutOpenInterestUSD = ZERO
        snapshot.totalPremiumVolume = ZERO
        snapshot.totalNotionalVolume = ZERO
      } else {
        //Load previous snapshot
        snapshot.totalLongCallOpenInterest = lastSnapshot.totalLongCallOpenInterest
        snapshot.totalShortCallOpenInterest = lastSnapshot.totalShortCallOpenInterest
        snapshot.totalLongPutOpenInterest = lastSnapshot.totalLongPutOpenInterest
        snapshot.totalShortPutOpenInterest = lastSnapshot.totalShortPutOpenInterest
        snapshot.totalLongCallOpenInterestUSD = lastSnapshot.totalLongCallOpenInterestUSD
        snapshot.totalShortCallOpenInterestUSD = lastSnapshot.totalShortCallOpenInterestUSD
        snapshot.totalLongPutOpenInterestUSD = lastSnapshot.totalLongPutOpenInterestUSD
        snapshot.totalShortPutOpenInterestUSD = lastSnapshot.totalShortPutOpenInterestUSD
        snapshot.totalPremiumVolume = lastSnapshot.totalPremiumVolume
        snapshot.totalNotionalVolume = lastSnapshot.totalNotionalVolume
      }
    }
    snapshot.blockTimestamp = timestamp

    return snapshot as MarketVolumeAndFeesSnapshot
  }

  export function loadOrCreateMarketSNXFeesSnapshot(
    optionMarketId: string,
    period: i32,
    timestamp: i32,
  ): MarketSNXFeesSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionMarketId, period, timestamp)
    let snapshot = MarketSNXFeesSnapshot.load(snapshotId)

    if (snapshot == null) {
      // create snapshot
      snapshot = new MarketSNXFeesSnapshot(snapshotId)

      snapshot.market = optionMarketId
      snapshot.period = period
      snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)

      snapshot.poolHedgerFees = ZERO
      snapshot.liquidityPoolFees = ZERO
      snapshot.otherFees = ZERO
      snapshot.poolHedgerVolume = ZERO
      snapshot.liquidityPoolVolume = ZERO
      snapshot.otherVolume = ZERO
    }
    snapshot.blockTimestamp = timestamp

    return snapshot as MarketSNXFeesSnapshot
  }

  export function createMarketGreeksSnapshot(
    optionMarketId: string,
    period: i32,
    timestamp: i32,
  ): MarketGreeksSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionMarketId, period, timestamp)
    let snapshot = new MarketGreeksSnapshot(snapshotId)

    snapshot.market = optionMarketId
    snapshot.period = period
    snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    snapshot.blockTimestamp = timestamp

    return snapshot as MarketGreeksSnapshot
  }

  export function createBoardBaseIVSnapshot(boardId: string, period: i32, timestamp: i32): BoardBaseIVSnapshot {
    let snapshotId = Snapshot.getSnapshotID(boardId, period, timestamp)

    let snapshot = new BoardBaseIVSnapshot(snapshotId)

    snapshot.board = boardId
    snapshot.period = period
    snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    snapshot.blockTimestamp = timestamp

    return snapshot as BoardBaseIVSnapshot
  }

  //We will always overwrite a snapshot with the same ID, since no data needs to be carried over
  export function createStrikeSnapshot(
    optionMarketId: string,
    strikeId_: BigInt,
    period: i32,
    timestamp: i32,
  ): StrikeIVAndGreeksSnapshot {
    let strikeId = getStrikeID(optionMarketId, strikeId_)
    let snapshotId = Snapshot.getSnapshotID(strikeId, period, timestamp)

    let snapshot = new StrikeIVAndGreeksSnapshot(snapshotId)
    snapshot.strike = strikeId
    snapshot.period = period
    snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    snapshot.blockTimestamp = timestamp

    return snapshot as StrikeIVAndGreeksSnapshot
  }

  export function createOptionPriceAndGreeksSnapshot(
    optionId: string,
    period: i32,
    timestamp: i32,
    blockNumber: i32,
  ): OptionPriceAndGreeksSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionId, period, timestamp)

    let snapshot = new OptionPriceAndGreeksSnapshot(snapshotId)
    snapshot.option = optionId
    snapshot.period = period
    snapshot.blockNumber = blockNumber
    snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)
    snapshot.blockTimestamp = timestamp

    return snapshot as OptionPriceAndGreeksSnapshot
  }

  export function loadOrCreateOptionVolumeSnapshot(
    optionId: string,
    period: i32,
    timestamp: i32,
  ): OptionVolumeSnapshot {
    let snapshotId = Snapshot.getSnapshotID(optionId, period, timestamp)
    let snapshot = OptionVolumeSnapshot.load(snapshotId)

    if (snapshot == null) {
      // create snapshot
      snapshot = new OptionVolumeSnapshot(snapshotId)
      snapshot.option = optionId
      snapshot.period = period
      snapshot.timestamp = Snapshot.roundTimestamp(timestamp, period)

      let option = Option.load(optionId)
      let lastSnapshot: OptionVolumeSnapshot | null =
        option == null ? null : OptionVolumeSnapshot.load(option.latestOptionVolume as string)

      snapshot.premiumVolume = ZERO
      snapshot.notionalVolume = ZERO

      //When creating an option, option is null here
      if (lastSnapshot == null) {
        snapshot.longOpenInterest = ZERO
        snapshot.shortOpenInterest = ZERO
        snapshot.totalPremiumVolume = ZERO
        snapshot.totalNotionalVolume = ZERO
      } else {
        snapshot.longOpenInterest = lastSnapshot.longOpenInterest
        snapshot.shortOpenInterest = lastSnapshot.shortOpenInterest
        snapshot.totalPremiumVolume = lastSnapshot.totalPremiumVolume
        snapshot.totalNotionalVolume = lastSnapshot.totalNotionalVolume
      }
    }
    snapshot.blockTimestamp = timestamp
    return snapshot as OptionVolumeSnapshot
  }
}
