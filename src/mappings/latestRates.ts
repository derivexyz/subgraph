import {
  AggregatorProxy as AggregatorProxyContract,
  AggregatorConfirmed as AggregatorConfirmedEvent,
} from '../../generated/templates/AggregatorProxy/AggregatorProxy'
import { AnswerUpdated as AnswerUpdatedEvent } from '../../generated/templates/Aggregator/Aggregator'
import { AggregatorProxy, Aggregator } from '../../generated/templates'
import { BigInt, DataSourceContext, dataSource, log, Address, Bytes } from '@graphprotocol/graph-ts'
import { Market, Board, SpotPriceSnapshot } from '../../generated/schema'
import { Entity, ZERO_ADDRESS, HOURLY_PERIODS, CANDLE_PERIODS, Snapshot, UNITDECIMAL, ZERO } from '../lib'
import { updateStrikeAndOptionGreeks } from '../market'

///////////////////////
////// HANDLERS //////
/////////////////////

export function handleAggregatorProxyAddressUpdated(event: AggregatorConfirmedEvent): void {
  let context = dataSource.context()
  addAggregator(event.params.latest, context.getString('market'))
}

export function handleAggregatorAnswerUpdated(event: AnswerUpdatedEvent): void {
  let context = dataSource.context()
  let rate = event.params.current.times(BigInt.fromI32(10).pow(10)) //Chainlink prices are 1e8, convert to 1e18
  let market = context.getString('market')
  addLatestRate(market, rate, event.block.timestamp.toI32(), event.block.number.toI32())
}

////////////////////////////////
////// SUPPORT FUNCTIONS //////
//////////////////////////////

export function addCandles(
  marketId: string,
  timestamp: i32,
  lastUpdateTimestamp: i32,
  rate: BigInt,
  blockNumber: i32,
): void {
  for (let p = 0; p < CANDLE_PERIODS.length; p++) {
    let period = CANDLE_PERIODS[p]

    let snapshotID = Snapshot.getSnapshotID(marketId, period, timestamp)
    let lastPeriodId = (timestamp - period) / period
    let lastSnapshotId = Snapshot.getSnapshotIDFromPeriodID(marketId, period, lastPeriodId)

    let priceSnapshot = SpotPriceSnapshot.load(snapshotID)
    let lastPriceSnapshot = SpotPriceSnapshot.load(lastSnapshotId)

    if (lastPriceSnapshot == null && lastUpdateTimestamp !== 0 && lastUpdateTimestamp !== timestamp) {
      // get the candle from the last rate update
      let prevPeriodId = lastUpdateTimestamp / period
      let prevSnapshot = SpotPriceSnapshot.load(
        Snapshot.getSnapshotIDFromPeriodID(marketId, period, prevPeriodId),
      ) as SpotPriceSnapshot

      let numPeriods = (timestamp - lastUpdateTimestamp) / period
      let blockEstimatePerPeriod = numPeriods > 0 ? (blockNumber - prevSnapshot.blockNumber) / numPeriods : 0

      // make new candles between that update and now
      for (let newPeriodId = prevPeriodId + 1; newPeriodId <= lastPeriodId; newPeriodId = newPeriodId + 1) {
        // create the new candle
        if (prevSnapshot) {
          let newSnapshot = new SpotPriceSnapshot(Snapshot.getSnapshotIDFromPeriodID(marketId, period, newPeriodId))
          newSnapshot.high = prevSnapshot.close
          newSnapshot.low = prevSnapshot.close
          newSnapshot.close = prevSnapshot.close
          newSnapshot.period = period
          newSnapshot.timestamp = (newPeriodId + 1) * period
          newSnapshot.blockTimestamp = (newPeriodId + 1) * period
          newSnapshot.blockNumber = prevSnapshot.blockNumber + blockEstimatePerPeriod

          newSnapshot.open = prevSnapshot.close
          newSnapshot.market = marketId
          newSnapshot.save()

          // set previous candle to this one
          prevSnapshot = newSnapshot
        }
      }

      // now reset the last candle
      lastPriceSnapshot = SpotPriceSnapshot.load(lastSnapshotId)
    }

    if (priceSnapshot == null) {
      priceSnapshot = new SpotPriceSnapshot(snapshotID)
      priceSnapshot.high = rate
      priceSnapshot.low = rate
      priceSnapshot.close = rate
      priceSnapshot.period = period
      priceSnapshot.market = marketId
      priceSnapshot.timestamp = Snapshot.roundTimestamp(timestamp, period) // store the beginning of this period, rather than the timestamp of the first rate update.

      if (lastPriceSnapshot !== null) {
        priceSnapshot.open = lastPriceSnapshot.close
        if (lastPriceSnapshot.close < priceSnapshot.low) {
          priceSnapshot.low = lastPriceSnapshot.close
        }
        if (lastPriceSnapshot.close > priceSnapshot.high) {
          priceSnapshot.high = lastPriceSnapshot.close
        }
      } else {
        priceSnapshot.open = rate
      }
    }

    if (priceSnapshot.low > rate) {
      priceSnapshot.low = rate
    }
    if (priceSnapshot.high < rate) {
      priceSnapshot.high = rate
    }
    priceSnapshot.close = rate
    priceSnapshot.spotPrice = rate

    priceSnapshot.save()
  }
}

export function addLatestRate(marketId: string, rate: BigInt, timestamp: i32, blockNumber: i32): void {
  let market = Market.load(marketId) as Market

  addCandles(market.id, timestamp, market.latestRateUpdateTimestamp, rate, blockNumber)

  //Update Rates
  market.latestSpotPrice = rate
  market.latestRateUpdateTimestamp = timestamp
  market.save()

  //We only want to run the rest of this once per hourly period
  //Too expensive to do every price update
  let currentGreekSnapshotPeriodId = timestamp / HOURLY_PERIODS[0]
  if (currentGreekSnapshotPeriodId == market.lastGreekSnapshotPeriodId) {
    return
  }
  market.lastGreekSnapshotPeriodId = currentGreekSnapshotPeriodId

  //Get the largest relevant period
  let base_period = HOURLY_PERIODS[0]
  let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
  for (let p = 1; p < HOURLY_PERIODS.length; p++) {
    if (Snapshot.roundTimestamp(timestamp, HOURLY_PERIODS[p]) == period_timestamp) {
      base_period = HOURLY_PERIODS[p]
    }
  }

  let boardIds = market.activeBoardIds
  let numBoards = boardIds.length
  let rateAndCarry = parseFloat(market.rateAndCarry.toBigDecimal().div(UNITDECIMAL).toString())
  let spotPrice = parseFloat(rate.toBigDecimal().div(UNITDECIMAL).toString())
  let netGamma = ZERO
  let netTheta = ZERO
  //let netOptionValue = ZERO
  for (let i = 0; i < numBoards; i++) {
    let board = Board.load(boardIds.pop()) as Board
    let strikeIds = board.strikeIds
    let numStrikes = strikeIds.length

    let boardNetGamma = ZERO
    let boardNetTheta = ZERO

    if (board.expiryTimestamp > timestamp) {
      let tAnnualised = f64(board.expiryTimestamp - timestamp) / f64(31536000)
      for (let j = 0; j < numStrikes; j++) {
        let strikeId = strikeIds.pop()
        let gammaAndTheta = updateStrikeAndOptionGreeks(
          marketId,
          strikeId,
          board.baseIv,
          tAnnualised,
          spotPrice,
          rate,
          rateAndCarry,
          base_period,
          timestamp,
          blockNumber,
        )
        netGamma = netGamma.plus(gammaAndTheta.gamma)
        netTheta = netTheta.plus(gammaAndTheta.theta)
        boardNetGamma = boardNetGamma.plus(gammaAndTheta.gamma)
        boardNetTheta = boardNetTheta.plus(gammaAndTheta.theta)
        //netOptionValue = netOptionValue.plus(gammaAndTheta.netOptionValue)
      }

      board.netGamma = boardNetGamma
      board.netTheta = boardNetTheta
      board.save()
    }
  }
  market.netGamma = netGamma
  market.netTheta = netTheta
  // market.netOptionValue = netOptionValue
  market.save()
}

export function addProxyAggregator(aggregatorProxyAddress: Address, optionMarketId: string): void {
  let proxy = AggregatorProxyContract.bind(aggregatorProxyAddress)
  let underlyingAggregator = proxy.try_aggregator()

  if (!underlyingAggregator.reverted) {
    let context = new DataSourceContext()
    context.setString('market', optionMarketId)

    AggregatorProxy.createWithContext(aggregatorProxyAddress, context)

    addAggregator(underlyingAggregator.value, optionMarketId)
  } else {
    log.error('Failed to fetch aggregator address from: {}', [aggregatorProxyAddress.toHex()])
    addAggregator(aggregatorProxyAddress, optionMarketId)
  }
}

export function addAggregator(aggregatorAddress: Address, optionMarketId: string): void {
  //check current aggregator address, and don't add again if its same
  let market = Market.load(optionMarketId) as Market

  if (
    market.chainlinkAggregator != Bytes.fromHexString(ZERO_ADDRESS) &&
    aggregatorAddress.toHex() == (market.chainlinkAggregator as Bytes).toHex()
  ) {
    return
  }

  market.chainlinkAggregator = aggregatorAddress
  market.save()

  let context = new DataSourceContext()
  context.setString('market', optionMarketId)

  Aggregator.createWithContext(aggregatorAddress, context)
}
