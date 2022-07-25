import {
  AggregatorProxy as AggregatorProxyContract,
  AggregatorConfirmed as AggregatorConfirmedEvent,
} from '../../generated/templates/AggregatorProxy/AggregatorProxy'
import { AnswerUpdated as AnswerUpdatedEvent } from '../../generated/templates/Aggregator/Aggregator'
import { AggregatorProxy, Aggregator } from '../../generated/templates'
import { BigInt, DataSourceContext, dataSource, log, Address, Bytes } from '@graphprotocol/graph-ts'
import { Market, Board, SpotPriceSnapshot } from '../../generated/schema'
import { Entity, ZERO_ADDRESS, PERIODS, Snapshot, UNITDECIMAL, ZERO } from '../lib'
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
  addLatestRate(market, rate, event.block.timestamp.toI32())
}

////////////////////////////////
////// SUPPORT FUNCTIONS //////
//////////////////////////////

export function addLatestRate(marketId: string, rate: BigInt, timestamp: i32): void {
  let market = Market.load(marketId) as Market

  //Update Rates
  market.latestSpotPrice = rate
  market.save()

  //Get the largest relevant period
  let base_period = PERIODS[0]
  let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
  for (let p = 1; p < PERIODS.length; p++) {
    if (Snapshot.roundTimestamp(timestamp, PERIODS[p]) == period_timestamp) {
      base_period = PERIODS[p]
    }
  }

  let existingSnapshotId = Snapshot.getSnapshotID(market.id, base_period, timestamp)
  let existingSnapshot = SpotPriceSnapshot.load(existingSnapshotId)

  //Dont fill same snapshot twice
  if (existingSnapshot != null) {
    return
  }

  let spotPriceSnapshot = Entity.createSpotPriceSnapshot(market.id, base_period, timestamp)
  spotPriceSnapshot.spotPrice = rate
  spotPriceSnapshot.save()

  let boardIds = market.activeBoardIds
  let numBoards = boardIds.length
  let rateAndCarry = parseFloat(market.rateAndCarry.toBigDecimal().div(UNITDECIMAL).toString())
  let spotPrice = parseFloat(rate.toBigDecimal().div(UNITDECIMAL).toString())
  let netGamma = ZERO
  let netTheta = ZERO
  for (let i = 0; i < numBoards; i++) {
    let board = Board.load(boardIds.pop()) as Board
    let strikeIds = board.strikeIds
    let numStrikes = strikeIds.length
    if(board.expiryTimestamp > timestamp){
      let tAnnualised = f64(board.expiryTimestamp - timestamp) / f64(31536000)
      for (let j = 0; j < numStrikes; j++) {
        let strikeId = strikeIds.pop()
        let gammaAndTheta = updateStrikeAndOptionGreeks(
          marketId,
          strikeId,
          board.baseIv,
          tAnnualised,
          spotPrice,
          rateAndCarry,
          base_period,
          timestamp
        )
        netGamma = netGamma.plus(gammaAndTheta.gamma)
        netTheta = netTheta.plus(gammaAndTheta.theta)
      }
    }
  }
  market.netGamma = netGamma
  market.netTheta = netTheta
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
