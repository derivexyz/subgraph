import { log } from '@graphprotocol/graph-ts'
import {
  BoardCreated,
  Trade,
  BoardSettled,
  OwnerChanged,
  BoardFrozen,
  BoardBaseIvSet,
  StrikeSkewSet,
  StrikeAdded,
} from '../../generated/templates/OptionMarket/OptionMarket'
import {
  Board,
  Option,
  OptionVolumeSnapshot,
  MarketVolumeAndFeesSnapshot,
  Market,
  Strike,
  OptionPriceAndGreeksSnapshot,
} from '../../generated/schema'
import { Entity, HOURLY_PERIODS, HOUR_SECONDS, Snapshot, UNIT, UNITDECIMAL, ZERO } from '../lib'
import {
  handleTradeClose,
  handleTradeOpen,
  updateBoardIV,
  updateOptionOpenInterest,
  updateStrikeAndOptionGreeks,
} from '../market'

export enum TradeDirection {
  OPEN,
  CLOSE,
  LIQUIDATE,
}

export function handleBoardCreated(event: BoardCreated): void {
  // create board entity
  let market = Entity.loadMarket(event.address)
  let boardId_ = event.params.boardId
  let boardId = Entity.getBoardID(market.id, boardId_)
  let board = new Board(boardId)

  let boardBaseIVSnapshot = Entity.createBoardBaseIVSnapshot(boardId, HOUR_SECONDS, event.block.timestamp.toI32())
  boardBaseIVSnapshot.baseIv = event.params.baseIv
  boardBaseIVSnapshot.save()

  let tempArray = market.activeBoardIds
  tempArray.push(boardId)
  market.activeBoardIds = tempArray

  let expiryTimestamp = event.params.expiry.toI32()
  let dateObj = new Date(event.params.expiry.toU64() * 1000)
  board.expiryTimestamp = expiryTimestamp // timestamp in seconds
  board.expiryTimestampReadable = dateObj.toDateString()

  board.boardId = boardId_
  board.baseIv = event.params.baseIv
  board.ivVariance = ZERO
  board.isExpired = false
  board.isPaused = false
  board.strikeIds = []

  // create market reference
  board.market = market.id

  board.save()
  market.save()

  log.info('Added Expiry {}', [boardId])
}

export function handleStrikeAdded(event: StrikeAdded): void {
  let optionMarketId = Entity.getIDFromAddress(event.address)
  let timestamp = event.block.timestamp.toI32()
  let blockNumber = event.block.number.toI32()

  let boardId = Entity.getBoardID(optionMarketId, event.params.boardId)
  let callOptionId = Entity.getOptionID(optionMarketId, event.params.strikeId, true)
  let putOptionId = Entity.getOptionID(optionMarketId, event.params.strikeId, false)
  let strikeId = Entity.getStrikeID(optionMarketId, event.params.strikeId)
  let market = Market.load(optionMarketId) as Market

  let board = Board.load(boardId) as Board

  //Arrays cannot be updated in place, this array rarely changes so shouldnt be a problem performance wise (re time travel queries)
  let tempArray = board.strikeIds
  tempArray.push(strikeId)
  board.strikeIds = tempArray

  // create strike entity
  let strike = new Strike(strikeId)
  strike.strikeId = event.params.strikeId
  strike.strikePrice = event.params.strikePrice
  strike.strikePriceReadable = event.params.strikePrice.toBigDecimal().div(UNIT.toBigDecimal()).toString()
  strike.skew = event.params.skew
  strike.skewVariance = ZERO
  strike.iv = board.baseIv.times(event.params.skew).div(UNIT)
  strike.market = optionMarketId
  strike.board = boardId
  strike.callOption = callOptionId
  strike.putOption = putOptionId
  strike.isExpired = false

  let callOption = createOption(callOptionId, optionMarketId, boardId, strikeId, true, timestamp, blockNumber)
  let putOption = createOption(putOptionId, optionMarketId, boardId, strikeId, false, timestamp, blockNumber)

  strike.save()
  board.save()
  putOption.save()
  callOption.save()

  if (board.expiryTimestamp > timestamp) {
    let tAnnualised = f64(board.expiryTimestamp - timestamp) / f64(31536000)
    let rateAndCarry = parseFloat(market.rateAndCarry.toBigDecimal().div(UNITDECIMAL).toString())
    let spotPrice = parseFloat(market.latestSpotPrice.toBigDecimal().div(UNITDECIMAL).toString())
    updateStrikeAndOptionGreeks(
      optionMarketId,
      strike.id,
      board.baseIv,
      tAnnualised,
      spotPrice,
      rateAndCarry,
      HOUR_SECONDS,
      timestamp,
      blockNumber
    )
  }

  log.info('Added Strike {}', [strikeId])
}

export function createOption(
  optionId: string,
  marketId: string,
  boardId: string,
  strikeId: string,
  isCall: boolean,
  timestamp: i32,
  blockNumber: i32,
): Option {
  let option = new Option(optionId)
  option.isCall = isCall
  option.market = marketId
  option.board = boardId
  option.strike = strikeId
  option.isExpired = false

  let optionGreekSnapshot: OptionPriceAndGreeksSnapshot
  let optionVolumeSnapshot: OptionVolumeSnapshot

  //Get the largest relevant period
  let base_period = HOURLY_PERIODS[0]
  let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
  for (let p = 1; p < HOURLY_PERIODS.length; p++) {
    if (Snapshot.roundTimestamp(timestamp, HOURLY_PERIODS[p]) == period_timestamp) {
      base_period = HOURLY_PERIODS[p]
    }
  }

  optionGreekSnapshot = Entity.createOptionPriceAndGreeksSnapshot(optionId, base_period, timestamp, blockNumber)
  optionGreekSnapshot.delta = ZERO
  optionGreekSnapshot.theta = ZERO
  optionGreekSnapshot.rho = ZERO
  optionGreekSnapshot.optionPrice = ZERO
  optionGreekSnapshot.save()
  optionVolumeSnapshot = Entity.loadOrCreateOptionVolumeSnapshot(optionId, base_period, timestamp)
  optionVolumeSnapshot.save()

  option.latestOptionPriceAndGreeks = optionGreekSnapshot.id
  option.latestOptionVolume = optionVolumeSnapshot.id

  return option
}

export function handleTrade(event: Trade): void {
  //Collateral Update only
  if (event.params.trade.amount.equals(ZERO)) {
    return
  }
  let tradeResults = event.params.tradeResults
  let len = tradeResults.length

  let optionFees = ZERO,
    spotFees = ZERO,
    vegaFees = ZERO,
    varianceFees = ZERO,
    volTraded = ZERO,
    newBaseIV = ZERO,
    newSkew = ZERO,
    newIV = ZERO,
    ivVariance = ZERO,
    premium = ZERO

  //Collateral Updates have a length of 0
  if (len != 0) {
    volTraded = tradeResults[len - 1].volTraded
    newBaseIV = tradeResults[len - 1].newBaseIv
    newSkew = tradeResults[len - 1].newSkew
    ivVariance = tradeResults[len - 1].varianceFee.ivVariance
    newIV = newBaseIV.times(newSkew).div(UNIT)

    for (let i = 0; i < len; i++) {
      let val = tradeResults.pop()
      optionFees = optionFees.plus(val.optionPriceFee)
      vegaFees = vegaFees.plus(val.vegaUtilFee.vegaUtilFee)
      spotFees = spotFees.plus(val.spotPriceFee)
      varianceFees = varianceFees.plus(val.varianceFee.varianceFee)
      premium = premium.plus(val.premium)
    }
  }

  let marketId = Entity.getIDFromAddress(event.address)

  if (event.params.trade.tradeDirection == TradeDirection.OPEN) {
    handleTradeOpen(
      marketId,
      event.block.number.toI32(),
      event.block.timestamp.toI32(),
      event.transaction.hash,
      event.params.strikeId,
      event.params.positionId.toI32(),
      event.params.trade.optionType,
      event.params.trade.amount,
      event.params.trade.totalCost,
      premium,
      volTraded,
      newBaseIV,
      ivVariance,
      newSkew,
      newIV,
      optionFees,
      spotFees,
      vegaFees,
      varianceFees,
    )
  } else {
    let isLiquidation = event.params.trade.tradeDirection == TradeDirection.LIQUIDATE
    handleTradeClose(
      marketId,
      event.block.number.toI32(),
      event.block.timestamp.toI32(),
      event.transaction.hash,
      event.params.strikeId,
      event.params.positionId.toI32(),
      event.params.trade.optionType,
      event.params.trade.isForceClose, //isForceClose
      isLiquidation, //isLiquidation
      isLiquidation ? Entity.loadPosition(marketId, event.params.positionId.toI32()).size : event.params.trade.amount, //amount: Only full liquidations
      event.params.trade.totalCost,
      premium,
      volTraded,
      newBaseIV,
      ivVariance,
      newSkew,
      newIV,
      optionFees,
      spotFees,
      vegaFees,
      varianceFees,
      isLiquidation ? event.params.liquidation.liquidatorFee : ZERO,
      isLiquidation ? event.params.liquidation.lpFee : ZERO,
      isLiquidation ? event.params.liquidation.smFee : ZERO,
    )
  }
}

//Update all Option OI for board to be 0 and reduce the market OI by same amount
export function handleBoardSettled(event: BoardSettled): void {
  let marketId = Entity.getIDFromAddress(event.address)
  let board = Entity.loadBoard(marketId, event.params.boardId) as Board

  board.isExpired = true
  board.spotPriceAtExpiry = event.params.spotPriceAtExpiry
  board.save()

  let expiredLongCallOI = ZERO
  let expiredShortCallOI = ZERO
  let expiredLongPutOI = ZERO
  let expiredShortPutOI = ZERO

  //Loop through all strikes for this board and update their OI.  Then sum totalOI change to update market
  let strikeIds = board.strikeIds
  let numStrikes = strikeIds.length
  for (let i = 0; i < numStrikes; i++) {
    let strikeId = strikeIds.pop()

    let strike = Strike.load(strikeId) as Strike
    strike.isExpired = true
    strike.save()

    let callOption = Option.load(Entity.getOptionIDFromStrikeID(strikeId, true)) as Option
    callOption.isExpired = true
    callOption.save()
    let latestCallSnapshot = OptionVolumeSnapshot.load(callOption.latestOptionVolume) as OptionVolumeSnapshot
    expiredLongCallOI = expiredLongCallOI.plus(latestCallSnapshot.longOpenInterest)
    expiredShortCallOI = expiredShortCallOI.plus(latestCallSnapshot.shortOpenInterest)

    //Update Option OI
    updateOptionOpenInterest(
      strikeId,
      true, // callOption
      latestCallSnapshot.longOpenInterest.neg(),
      latestCallSnapshot.shortOpenInterest.neg(),
      ZERO,
      ZERO,
      event.block.timestamp.toI32(),
    )

    let putOption = Option.load(Entity.getOptionIDFromStrikeID(strikeId, false)) as Option
    putOption.isExpired = true
    putOption.save()
    let latestPutSnapshot = OptionVolumeSnapshot.load(putOption.latestOptionVolume) as OptionVolumeSnapshot
    expiredLongPutOI = expiredLongPutOI.plus(latestPutSnapshot.longOpenInterest)
    expiredShortPutOI = expiredShortPutOI.plus(latestPutSnapshot.shortOpenInterest)

    updateOptionOpenInterest(
      strikeId,
      false, // putOption
      latestPutSnapshot.longOpenInterest.neg(),
      latestPutSnapshot.shortOpenInterest.neg(),
      ZERO,
      ZERO,
      event.block.timestamp.toI32(),
    )
  }

  /////////// Market updates ////////////
  let market = Market.load(marketId) as Market
  //Remove board from market.activeBoardIds
  let tempArray = market.activeBoardIds
  var idx = tempArray.indexOf(board.id)
  if (idx != -1) {
    tempArray.splice(idx, 1)
  }
  market.activeBoardIds = tempArray

  let latestMarketSnapshot: MarketVolumeAndFeesSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    latestMarketSnapshot = Entity.loadOrCreateMarketVolumeAndFeesSnapshot(
      marketId,
      HOURLY_PERIODS[p],
      event.block.timestamp.toI32(),
    ) as MarketVolumeAndFeesSnapshot
    latestMarketSnapshot.totalLongCallOpenInterest =
      latestMarketSnapshot.totalLongCallOpenInterest.minus(expiredLongCallOI)
    latestMarketSnapshot.totalShortCallOpenInterest =
      latestMarketSnapshot.totalShortCallOpenInterest.minus(expiredShortCallOI)
    latestMarketSnapshot.totalLongPutOpenInterest =
      latestMarketSnapshot.totalLongPutOpenInterest.minus(expiredLongPutOI)
    latestMarketSnapshot.totalShortPutOpenInterest =
      latestMarketSnapshot.totalShortPutOpenInterest.minus(expiredShortPutOI)
    latestMarketSnapshot.save()
  }

  market.latestVolumeAndFees = latestMarketSnapshot.id

  market.save()
}

export function handleOwnerChanged(event: OwnerChanged): void {
  let market = Entity.loadMarket(event.address)
  market.owner = event.params.newOwner
  market.save()
}

export function handleBoardFrozen(event: BoardFrozen): void {
  let board = Entity.loadBoard(Entity.getIDFromAddress(event.address), event.params.boardId)

  board.isPaused = event.params.frozen
  board.save()
}

export function handleBoardBaseIvSet(event: BoardBaseIvSet): void {
  let optionMarketId = Entity.getIDFromAddress(event.address)
  let boardId = Entity.getBoardID(optionMarketId, event.params.boardId)
  let timestamp = event.block.timestamp.toI32()
  // update board iv and strike vols and skews
  updateBoardIV(boardId, timestamp, event.params.baseIv, ZERO)
  let market = Market.load(optionMarketId) as Market
  let board = Board.load(boardId) as Board
  let strikeIds = board.strikeIds
  let numStrikes = strikeIds.length
  if (board.expiryTimestamp > timestamp) {
    let tAnnualised = f64(board.expiryTimestamp - timestamp) / f64(31536000)
    let rateAndCarry = parseFloat(market.rateAndCarry.toBigDecimal().div(UNITDECIMAL).toString())
    let spotPrice = parseFloat(market.latestSpotPrice.toBigDecimal().div(UNITDECIMAL).toString())
    for (let i = 0; i < numStrikes; i++) {
      updateStrikeAndOptionGreeks(
        optionMarketId,
        strikeIds.pop(),
        event.params.baseIv,
        tAnnualised,
        spotPrice,
        rateAndCarry,
        HOUR_SECONDS,
        timestamp,
        event.block.number.toI32()
      )
    }
  }
}

//Doesnt update strike greeks. (Vol, price, etc)
// Because ListingId/IV isnt available here
export function handleStrikeSkewSet(event: StrikeSkewSet): void {
  // update strike vol and skew
  let strike = Entity.loadStrike(Entity.getIDFromAddress(event.address), event.params.strikeId)
  strike.skew = event.params.skew
  strike.save()
}
