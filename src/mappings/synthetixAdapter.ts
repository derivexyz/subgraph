import { Address, BigInt } from '@graphprotocol/graph-ts'
import { Market, MarketSNXFeesSnapshot } from '../../generated/schema'
import {
  SynthetixAddressesUpdated,
  AddressResolverSet,
  BaseSwappedForQuote,
  QuoteSwappedForBase,
} from '../../generated/templates/SynthetixAdapter/SynthetixAdapter'
import { Entity, HOURLY_PERIODS, UNIT } from '../lib'

export function handleSynthetixAddressesUpdated(event: SynthetixAddressesUpdated): void {
  let global = Entity.loadOrCreateGlobal()
  global.exchangeRatesAddress = event.params.exchangeRates
  global.save()
}

export function handleAddressResolverSet(event: AddressResolverSet): void {
  let global = Entity.loadOrCreateGlobal()
  global.resolverAddress = event.params.addressResolver
  global.save()
}

//Handles SNX Fees for swaps from base
export function handleBaseSwappedForQuote(event: BaseSwappedForQuote): void {
  let market = Entity.loadMarket(event.params.marketAddress)

  let expectedReturn = market.latestSpotPrice.times(event.params.baseSwapped).div(UNIT)
  let snxFee = expectedReturn.minus(event.params.quoteReceived)

  updateSNXFeesSnapshot(market, snxFee, expectedReturn, event.params.exchanger, event.block.timestamp.toI32())
}

//Handles SNX Fees for swaps to base
export function handleQuoteSwappedForBase(event: QuoteSwappedForBase): void {
  let market = Entity.loadMarket(event.params.marketAddress)

  let expectedReturn = event.params.quoteSwapped.times(UNIT).div(market.latestSpotPrice)
  let snxFee = expectedReturn.minus(event.params.baseReceived).times(market.latestSpotPrice).div(UNIT)

  updateSNXFeesSnapshot(
    market,
    snxFee,
    event.params.quoteSwapped,
    event.params.exchanger,
    event.block.timestamp.toI32(),
  )
}

export function updateSNXFeesSnapshot(
  market: Market,
  snxFee: BigInt,
  snxVolume: BigInt,
  exchangerAddress: Address,
  timestamp: i32,
): void {
  let exchanger = Entity.getIDFromAddress(exchangerAddress)
  let marketSNXFeesSnapshot: MarketSNXFeesSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    marketSNXFeesSnapshot = Entity.loadOrCreateMarketSNXFeesSnapshot(market.id, HOURLY_PERIODS[p], timestamp)
    if (exchanger == market.poolHedger) {
      marketSNXFeesSnapshot.poolHedgerFees = marketSNXFeesSnapshot.poolHedgerFees.plus(snxFee)
      marketSNXFeesSnapshot.poolHedgerVolume = marketSNXFeesSnapshot.poolHedgerVolume.plus(snxVolume)
    } else if (exchanger == market.liquidityPool) {
      marketSNXFeesSnapshot.liquidityPoolFees = marketSNXFeesSnapshot.liquidityPoolFees.plus(snxFee)
      marketSNXFeesSnapshot.liquidityPoolVolume = marketSNXFeesSnapshot.liquidityPoolVolume.plus(snxVolume)
    } else {
      marketSNXFeesSnapshot.otherFees = marketSNXFeesSnapshot.otherFees.plus(snxFee)
      marketSNXFeesSnapshot.otherVolume = marketSNXFeesSnapshot.otherVolume.plus(snxVolume)
    }
    marketSNXFeesSnapshot.save()
  }
  market.latestSNXFees = marketSNXFeesSnapshot.id
  market.save()
}
