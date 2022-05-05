import { dataSource } from '@graphprotocol/graph-ts'
import { Market } from '../../generated/schema'
import {
  PricingParametersSet,
  TradeLimitParametersSet,
} from '../../generated/templates/OptionMarketPricer/OptionMarketPricer'

export function handlePricingParametersSet(event: PricingParametersSet): void {
  let context = dataSource.context()
  let market = Market.load(context.getString('market')) as Market

  market.standardSize = event.params.pricingParams.standardSize
  market.skewAdjustmentFactor = event.params.pricingParams.skewAdjustmentFactor

  market.save()
}

export function handleTradeLimitParametersSet(event: TradeLimitParametersSet): void {
  let context = dataSource.context()
  let market = Market.load(context.getString('market')) as Market

  market.tradingCutoff = event.params.tradeLimitParams.tradingCutoff.toI32()

  market.save()
}
