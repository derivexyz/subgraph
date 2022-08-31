import { BigInt, log, Bytes } from '@graphprotocol/graph-ts'
import {
  Board,
  BoardBaseIVSnapshot,
  CollateralUpdate,
  Market,
  MarketGreeksSnapshot,
  MarketVolumeAndFeesSnapshot,
  Option,
  OptionPriceAndGreeksSnapshot,
  OptionVolumeSnapshot,
  Pool,
  PoolHedger,
  PoolHedgerExposureSnapshot,
  Position,
  Settle,
  Strike,
  StrikeIVAndGreeksSnapshot,
  Trade,
} from '../generated/schema'
import { Entity, UNIT, ZERO, BlackScholes, HOURLY_PERIODS, Snapshot, DAY_SECONDS, UNITDECIMAL } from './lib'

export class optionPrices {
  callPrice: BigInt
  putPrice: BigInt
  constructor(callPrice_: BigInt, putPrice_: BigInt) {
    this.callPrice = callPrice_
    this.putPrice = putPrice_
  }
}
export class gammaAndTheta {
  gamma: BigInt
  theta: BigInt
}
/////////////////////////////
////// MARKET FUNCTIONS //////
///////////////////////////

export function updateMarketGreeks(
  optionMarketId: string,
  timestamp: i32,
  optionNetDelta: BigInt,
  netStdVega: BigInt,
): void {
  let market = Market.load(optionMarketId) as Market

  //Global Net Delta = sum netDelta + pool base balance + hedger delta
  // Load pool
  // Load latest hedger delta
  let hedger = PoolHedger.load(market.poolHedger) as PoolHedger
  let hedgerDelta = (PoolHedgerExposureSnapshot.load(hedger.latestPoolHedgerExposure) as PoolHedgerExposureSnapshot)
    .currentNetDelta

  let poolBaseBalance = (Pool.load(market.liquidityPool) as Pool).baseBalance
  let poolNetDelta = poolBaseBalance.minus(optionNetDelta)
  let globalNetDelta = poolNetDelta.plus(hedgerDelta)

  let marketGreeksSnapshot: MarketGreeksSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    marketGreeksSnapshot = Entity.createMarketGreeksSnapshot(optionMarketId, HOURLY_PERIODS[p], timestamp)
    marketGreeksSnapshot.hedgerNetDelta = hedgerDelta
    marketGreeksSnapshot.baseBalance = poolBaseBalance
    marketGreeksSnapshot.poolNetDelta = poolNetDelta
    marketGreeksSnapshot.optionNetDelta = optionNetDelta
    marketGreeksSnapshot.netDelta = globalNetDelta
    marketGreeksSnapshot.netStdVega = netStdVega
    marketGreeksSnapshot.netGamma = market.netGamma
    marketGreeksSnapshot.netTheta = market.netTheta
    marketGreeksSnapshot.save()
  }

  if (market.latestGreeks != marketGreeksSnapshot.id) {
    market.latestGreeks = marketGreeksSnapshot.id
    market.save()
  }
}

//Updates the boardIV/snapshot and then calls updateStrikeAndOptionGreeks with new IV
export function updateBoardIV(boardId: string, timestamp: i32, baseIv: BigInt, ivVariance: BigInt): void {
  // update board iv
  let board = Board.load(boardId) as Board
  board.baseIv = baseIv
  board.ivVariance = ivVariance

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    let boardBaseIVSnapshot = Entity.createBoardBaseIVSnapshot(board.id, HOURLY_PERIODS[p], timestamp)
    boardBaseIVSnapshot.baseIv = baseIv
    boardBaseIVSnapshot.ivVariance = ivVariance
    boardBaseIVSnapshot.save()
  }
  board.save()
}

export function updateStrikeAndOptionGreeks(
  optionMarketId: string,
  strikeId: string,
  baseIv: BigInt,
  tAnnualised: number,
  latestSpotPrice: number,
  rateAndCarry: number,
  period: i32,
  timestamp: i32,
  blockNumber: i32,
): gammaAndTheta {
  let strike = Strike.load(strikeId) as Strike
  let callOption = Option.load(strike.callOption) as Option
  let putOption = Option.load(strike.putOption) as Option

  //CALCULATE GREEKS
  let strikeIv = strike.skew.times(baseIv).div(UNIT)
  strike.iv = strikeIv

  let allGreeks = BlackScholes.calculateGreeks(
    tAnnualised,
    parseFloat(strikeIv.toBigDecimal().div(UNITDECIMAL).toString()),
    latestSpotPrice,
    parseFloat(strike.strikePriceReadable),
    rateAndCarry,
  )

  let callOptionGreekSnapshot: OptionPriceAndGreeksSnapshot
  let putOptionGreekSnapshot: OptionPriceAndGreeksSnapshot
  let latestStrikeSnapshot: StrikeIVAndGreeksSnapshot

  //Update Strike Greeks
  latestStrikeSnapshot = Entity.createStrikeSnapshot(optionMarketId, strike.strikeId, period, timestamp)
  latestStrikeSnapshot.board = strike.board
  latestStrikeSnapshot.skew = strike.skew
  latestStrikeSnapshot.skewVariance = strike.skewVariance
  latestStrikeSnapshot.iv = strikeIv
  latestStrikeSnapshot.gamma = allGreeks.gamma
  latestStrikeSnapshot.vega = allGreeks.vega
  latestStrikeSnapshot.save()

  //Update Call option greeks
  callOptionGreekSnapshot = Entity.createOptionPriceAndGreeksSnapshot(callOption.id, period, timestamp, blockNumber)
  callOptionGreekSnapshot.optionPrice = allGreeks.callPrice
  callOptionGreekSnapshot.delta = allGreeks.callDelta
  callOptionGreekSnapshot.theta = allGreeks.callTheta
  callOptionGreekSnapshot.rho = allGreeks.callRho
  callOptionGreekSnapshot.save()

  //Update Put option greeks
  putOptionGreekSnapshot = Entity.createOptionPriceAndGreeksSnapshot(putOption.id, period, timestamp, blockNumber)
  putOptionGreekSnapshot.optionPrice = allGreeks.putPrice
  putOptionGreekSnapshot.delta = allGreeks.putDelta
  putOptionGreekSnapshot.theta = allGreeks.putTheta
  putOptionGreekSnapshot.rho = allGreeks.putRho
  putOptionGreekSnapshot.save()

  if (callOption.latestOptionPriceAndGreeks != callOptionGreekSnapshot.id) {
    callOption.latestOptionPriceAndGreeks = callOptionGreekSnapshot.id
    callOption.save()
  }
  if (putOption.latestOptionPriceAndGreeks != putOptionGreekSnapshot.id) {
    putOption.latestOptionPriceAndGreeks = putOptionGreekSnapshot.id
    putOption.save()
  }

  strike.latestStrikeIVAndGreeks = latestStrikeSnapshot.id
  strike.save()

  //Load latest open interest snapshot
  let callOISnapshot = OptionVolumeSnapshot.load(callOption.latestOptionVolume) as OptionVolumeSnapshot
  let putOISnapshot = OptionVolumeSnapshot.load(putOption.latestOptionVolume) as OptionVolumeSnapshot
  callOISnapshot.blockTimestamp = timestamp
  putOISnapshot.blockTimestamp = timestamp

  let gamma = allGreeks.gamma
    .times(
      callOISnapshot.longOpenInterest
        .plus(putOISnapshot.longOpenInterest)
        .minus(callOISnapshot.shortOpenInterest)
        .minus(putOISnapshot.shortOpenInterest),
    )
    .div(UNIT)
  let callTheta = allGreeks.callTheta
    .times(callOISnapshot.longOpenInterest.minus(callOISnapshot.shortOpenInterest))
    .div(UNIT)
  let putTheta = allGreeks.putTheta
    .times(putOISnapshot.longOpenInterest.minus(putOISnapshot.shortOpenInterest))
    .div(UNIT)
  let theta = callTheta.plus(putTheta)
  return { gamma, theta }
}

export function updateOptionOpenInterest(
  strikeId: string,
  isCall: boolean,
  longOpenInterestChange: BigInt,
  shortOpenInterestChange: BigInt,
  premiumVolume: BigInt,
  notionalVolume: BigInt,
  timestamp: i32,
): void {
  let option = Option.load(Entity.getOptionIDFromStrikeID(strikeId, isCall)) as Option

  //Update OI in snapshot
  let optionVolumeSnapshot: OptionVolumeSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    optionVolumeSnapshot = Entity.loadOrCreateOptionVolumeSnapshot(
      Entity.getOptionIDFromStrikeID(strikeId, isCall),
      HOURLY_PERIODS[p],
      timestamp,
    )
    optionVolumeSnapshot.longOpenInterest = optionVolumeSnapshot.longOpenInterest.plus(longOpenInterestChange)
    optionVolumeSnapshot.shortOpenInterest = optionVolumeSnapshot.shortOpenInterest.plus(shortOpenInterestChange)

    optionVolumeSnapshot.premiumVolume = optionVolumeSnapshot.premiumVolume.plus(premiumVolume)
    optionVolumeSnapshot.notionalVolume = optionVolumeSnapshot.notionalVolume.plus(notionalVolume)
    optionVolumeSnapshot.totalPremiumVolume = optionVolumeSnapshot.totalPremiumVolume.plus(premiumVolume)
    optionVolumeSnapshot.totalNotionalVolume = optionVolumeSnapshot.totalNotionalVolume.plus(notionalVolume)

    optionVolumeSnapshot.save()
  }

  //If new snapshot, update reference
  if (option.latestOptionVolume != optionVolumeSnapshot.id) {
    option.latestOptionVolume = optionVolumeSnapshot.id
    option.save()
  }
}

export function updateMarketVolumeAndFees(
  optionMarketId: string,
  timestamp: i32,
  premiumVolume: BigInt,
  notionalVolume: BigInt,
  longCallOpenInterestChange: BigInt,
  shortCallOpenInterestChange: BigInt,
  longPutOpenInterestChange: BigInt,
  shortPutOpenInterestChange: BigInt,
  spotFees: BigInt,
  optionFees: BigInt,
  vegaFees: BigInt,
  varianceFees: BigInt,
  deltaCutoffFees: BigInt,
  liquidatorFee: BigInt,
  lpFee: BigInt,
  smFee: BigInt,
): void {
  let market = Market.load(optionMarketId) as Market
  let marketSnapshot: MarketVolumeAndFeesSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    marketSnapshot = Entity.loadOrCreateMarketVolumeAndFeesSnapshot(optionMarketId, HOURLY_PERIODS[p], timestamp)

    //Volume
    marketSnapshot.premiumVolume = marketSnapshot.premiumVolume.plus(premiumVolume)
    marketSnapshot.notionalVolume = marketSnapshot.notionalVolume.plus(notionalVolume)
    marketSnapshot.totalNotionalVolume = marketSnapshot.totalNotionalVolume.plus(notionalVolume)
    marketSnapshot.totalPremiumVolume = marketSnapshot.totalPremiumVolume.plus(premiumVolume)
    //OI
    marketSnapshot.totalLongCallOpenInterest = marketSnapshot.totalLongCallOpenInterest.plus(longCallOpenInterestChange)
    marketSnapshot.totalShortCallOpenInterest =
      marketSnapshot.totalShortCallOpenInterest.plus(shortCallOpenInterestChange)
    marketSnapshot.totalLongPutOpenInterest = marketSnapshot.totalLongPutOpenInterest.plus(longPutOpenInterestChange)
    marketSnapshot.totalShortPutOpenInterest = marketSnapshot.totalShortPutOpenInterest.plus(shortPutOpenInterestChange)
    //Fees
    marketSnapshot.spotPriceFees = marketSnapshot.spotPriceFees.plus(spotFees)
    marketSnapshot.optionPriceFees = marketSnapshot.optionPriceFees.plus(optionFees)
    marketSnapshot.vegaFees = marketSnapshot.vegaFees.plus(vegaFees)
    marketSnapshot.varianceFees = marketSnapshot.varianceFees.plus(varianceFees)
    marketSnapshot.deltaCutoffFees = marketSnapshot.deltaCutoffFees.plus(deltaCutoffFees)
    marketSnapshot.liquidatorFees = marketSnapshot.liquidatorFees.plus(liquidatorFee)
    marketSnapshot.smLiquidationFees = marketSnapshot.smLiquidationFees.plus(smFee)
    marketSnapshot.lpLiquidationFees = marketSnapshot.lpLiquidationFees.plus(lpFee)

    marketSnapshot.save()
  }

  if (market.latestVolumeAndFees != marketSnapshot.id) {
    market.latestVolumeAndFees = marketSnapshot.id
    market.save()
  }
}

/////////////////////////////
////// TRADE FUNCTIONS //////
///////////////////////////

//Create/Update Position -> Create Trade -> Update Market/Option OI and Market Fees
export function handleTradeOpen(
  optionMarketId: string,
  block: i32,
  timestamp: i32,
  txHash: Bytes,
  strikeId: BigInt,
  positionId_: i32,
  positionType: i32,
  amount: BigInt,
  totalCost: BigInt,
  premium: BigInt,
  volTraded: BigInt,
  newBaseIV: BigInt,
  ivVariance: BigInt,
  newSkew: BigInt,
  newIV: BigInt,
  optionFees: BigInt,
  spotFees: BigInt,
  vegaFees: BigInt,
  varianceFees: BigInt,
): void {
  let positionId = Entity.getPositionID(optionMarketId, positionId_)
  let strike = Entity.loadStrike(optionMarketId, strikeId) as Strike

  //Update Strike skew and board IV
  if (newSkew != ZERO) {
    strike.skew = newSkew
    strike.iv = newIV
    strike.save()

    updateBoardIV(strike.board, timestamp, newBaseIV, ivVariance)
  } else {
    newSkew = strike.skew
    newIV = strike.iv
    newBaseIV = strike.iv.times(UNIT).div(strike.skew)
  }

  createTrade(
    optionMarketId,
    block,
    positionId,
    timestamp,
    txHash,
    true, //isOpen
    Entity.getIsLong(positionType),
    false, //isLiquidation
    false, //isForceClose
    amount,
    volTraded,
    newBaseIV,
    newSkew,
    newIV,
    totalCost,
    premium,
    spotFees,
    vegaFees,
    varianceFees,
    optionFees,
    ZERO, //Delta Cutoff Fees (Only possible on close)
    ZERO,
    ZERO,
    ZERO,
  )

  //Update Market/Option Fees and OI
  updateValuesAfterTrade(
    optionMarketId,
    timestamp,
    strike.id,
    strike.strikePrice,
    positionType,
    amount,
    totalCost,
    optionFees,
    spotFees,
    vegaFees,
    varianceFees,
    ZERO, //Delta Cutoff Fees (Only possible on close)
    ZERO,
    ZERO,
    ZERO,
  )
}

export function handleTradeClose(
  optionMarketId: string,
  block: i32,
  timestamp: i32,
  txHash: Bytes,
  strikeId: BigInt,
  positionId_: i32,
  positionType: i32,
  isForceClose: boolean,
  isLiquidation: boolean,
  amount: BigInt,
  totalCost: BigInt,
  premium: BigInt,
  volTraded: BigInt,
  newBaseIV: BigInt,
  ivVariance: BigInt,
  newSkew: BigInt,
  newIV: BigInt,
  optionFees: BigInt,
  spotFees: BigInt,
  vegaFees: BigInt,
  varianceFees: BigInt,
  liquidatorFee: BigInt,
  lpFee: BigInt,
  smFee: BigInt,
): void {
  let positionId = Entity.getPositionID(optionMarketId, positionId_)
  let strike = Entity.loadStrike(optionMarketId, strikeId) as Strike

  let deltaCutoffFees = ZERO
  if (isForceClose) {
    let position = Position.load(positionId) as Position
    let option = Option.load(position.option as string) as Option
    let board = Board.load(strike.board) as Board
    let timeToExpiry = board.expiryTimestamp - timestamp
    let market = Market.load(optionMarketId) as Market

    let optionPrice = BlackScholes.getBlackScholesPrice(
      timeToExpiry,
      strike.iv,
      market.latestSpotPrice,
      strike.strikePrice,
      market.rateAndCarry,
      option.isCall,
    )

    if (Entity.getIsLong(positionType)) {
      deltaCutoffFees = optionPrice.times(amount).div(UNIT).minus(premium)
    } else {
      deltaCutoffFees = premium.minus(optionPrice.times(amount).div(UNIT))
    }
  }

  if (newSkew != ZERO) {
    //Update Strike skew and board IV
    strike.skew = newSkew
    strike.iv = newIV
    strike.save()

    updateBoardIV(strike.board, timestamp, newBaseIV, ivVariance)
  } else {
    newSkew = strike.skew
    newIV = strike.iv
    newBaseIV = strike.iv.times(UNIT).div(strike.skew)
  }

  createTrade(
    optionMarketId,
    block,
    positionId,
    timestamp,
    txHash,
    false, //isOpen
    !Entity.getIsLong(positionType),
    isLiquidation,
    isForceClose,
    amount,
    volTraded,
    newBaseIV,
    newSkew,
    newIV,
    totalCost,
    premium,
    spotFees,
    vegaFees,
    varianceFees,
    optionFees,
    deltaCutoffFees,
    liquidatorFee,
    lpFee,
    smFee,
  )

  //Update Market/Option Fees and OI
  updateValuesAfterTrade(
    optionMarketId,
    timestamp,
    strike.id,
    strike.strikePrice,
    positionType,
    amount.neg(),
    totalCost,
    optionFees,
    spotFees,
    vegaFees,
    varianceFees,
    deltaCutoffFees,
    liquidatorFee,
    lpFee,
    smFee,
  )
}

export function handleTradeSettle(
  optionMarketId: string,
  block: i32,
  positionId_: i32,
  txHash: Bytes,
  timestamp: i32,
  amount: BigInt,
  priceAtExpiry: BigInt,
): void {
  let positionId = Entity.getPositionID(optionMarketId, positionId_)
  let position = Position.load(positionId) as Position
  let option = Option.load(position.option as string) as Option
  let strike = Strike.load(option.strike) as Strike
  let settle = new Settle(Entity.getTradeIDFromPositionID(positionId, txHash))

  settle.position = positionId
  position.settle = settle.id
  settle.owner = position.owner
  settle.timestamp = timestamp
  settle.blockNumber = block
  settle.transactionHash = txHash
  settle.size = amount
  settle.spotPriceAtExpiry = priceAtExpiry

  if (option.isCall && priceAtExpiry.gt(strike.strikePrice)) {
    let diff = priceAtExpiry.minus(strike.strikePrice).times(amount).div(UNIT)
    settle.profit = position.isLong ? diff : diff.neg()
  } else if (!option.isCall && priceAtExpiry.lt(strike.strikePrice)) {
    let diff = strike.strikePrice.minus(priceAtExpiry).times(amount).div(UNIT)
    settle.profit = position.isLong ? diff : diff.neg()
  } else {
    settle.profit = ZERO
  }

  settle.save()
  position.save()
}

export function updateValuesAfterTrade(
  optionMarketId: string,
  timestamp: i32,
  strikeId: string,
  strikeValue: BigInt,
  positionType: i32,
  amount: BigInt,
  premiumVolume: BigInt,
  optionFees: BigInt,
  spotFees: BigInt,
  vegaFees: BigInt,
  varianceFees: BigInt,
  deltaCutoffFees: BigInt,
  liquidatorFee: BigInt,
  lpFee: BigInt,
  smFee: BigInt,
): void {
  let isCall = Entity.getIsCall(positionType)
  let isLong = Entity.getIsLong(positionType)

  let longCallOIChange = isCall && isLong ? amount : ZERO
  let shortCallOIChange = isCall && !isLong ? amount : ZERO
  let longPutOIChange = !isCall && isLong ? amount : ZERO
  let shortPutOIChange = !isCall && !isLong ? amount : ZERO

  let notionalVol = amount.times(strikeValue).div(UNIT).abs()
  updateOptionOpenInterest(
    strikeId,
    isCall,
    longCallOIChange.plus(longPutOIChange), //longOI Change, one will be 0
    shortCallOIChange.plus(shortPutOIChange), //shortOI Change, one will be 0
    premiumVolume,
    notionalVol,
    timestamp,
  )

  updateMarketVolumeAndFees(
    optionMarketId,
    timestamp,
    premiumVolume,
    notionalVol,
    longCallOIChange, //long call OI Change
    shortCallOIChange, //short call OI Change
    longPutOIChange, //long put OI Change
    shortPutOIChange, //short put OI Change
    spotFees,
    optionFees,
    vegaFees,
    varianceFees,
    deltaCutoffFees,
    liquidatorFee,
    lpFee,
    smFee,
  )
}

export function createTrade(
  optionMarketId: string,
  block: i32,
  positionId: string,
  timestamp: i32,
  txHash: Bytes,
  isOpen: boolean,
  isBuy: boolean,
  isLiquidation: boolean,
  isForceClose: boolean,
  amount: BigInt,
  volTraded: BigInt,
  newBaseIV: BigInt,
  newSkew: BigInt,
  newIV: BigInt,
  totalCost: BigInt,
  premium: BigInt,
  spotPriceFee: BigInt,
  vegaUtilFee: BigInt,
  varianceFee: BigInt,
  optionPriceFee: BigInt,
  deltaCutoffFee: BigInt,
  liquidatorFee: BigInt,
  lpFee: BigInt,
  smFee: BigInt,
): void {
  let tradeId = Entity.getTradeIDFromPositionID(positionId, txHash)
  let trade = new Trade(tradeId)
  let position = Position.load(positionId) as Position

  let spotPrice = (Market.load(optionMarketId) as Market).latestSpotPrice

  //Position.size is updated prior to this
  // Average Cost = ((Previous_Size * Prev_Avg_Cost) + New_Premium) / New_Position_Size
  if (isOpen && position.size != ZERO) {
    position.averageCostPerOption = position.size
      .minus(amount)
      .times(position.averageCostPerOption)
      .div(UNIT)
      .plus(totalCost)
      .times(UNIT)
      .div(position.size)
    position.save()
  }

  let pricePerOption = amount == ZERO ? ZERO : totalCost.times(UNIT).div(amount)

  ////COLLATERAL UPDATE
  if (!position.isLong) {
    let collateralUpdate = CollateralUpdate.load(
      Entity.getCollateralUpdateID(optionMarketId, position.positionId, txHash),
    )

    if (collateralUpdate != null) {
      collateralUpdate.trade = tradeId
      trade.collateralUpdate = collateralUpdate.id
      trade.setCollateralTo = collateralUpdate.amount
      collateralUpdate.save()
    }
  }

  trade.position = positionId
  trade.blockNumber = block
  trade.market = optionMarketId
  trade.option = position.option as string
  trade.board = position.board as string
  trade.strike = position.strike as string
  trade.trader = position.owner
  trade.timestamp = timestamp
  trade.transactionHash = txHash
  trade.isBuy = isBuy
  trade.isOpen = isOpen
  trade.isLiquidation = isLiquidation
  trade.isForceClose = isForceClose
  trade.size = amount
  trade.volTraded = volTraded
  trade.newBaseIv = newBaseIV
  trade.newSkew = newSkew
  trade.newIv = newIV
  trade.premium = totalCost
  trade.premiumLessFees = premium
  trade.pricePerOption = pricePerOption
  trade.spotPrice = spotPrice
  trade.spotPriceFee = spotPriceFee
  trade.vegaUtilFee = vegaUtilFee
  trade.varianceFee = varianceFee
  trade.optionPriceFee = optionPriceFee
  trade.deltaCutoffFee = deltaCutoffFee

  trade.liquidatorFee = liquidatorFee
  trade.smLiquidationFee = smFee
  trade.lpLiquidationFee = lpFee

  trade.save()
}
