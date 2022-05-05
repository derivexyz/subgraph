import { Trade } from '../../generated/schema'
import { PositionTraded } from '../../generated/templates/OptionMarketWrapper/OptionMarketWrapper'
import { Entity, ZERO } from '../lib'

//Handles external swap fees
export function handlePositionTraded(event: PositionTraded): void {
  if (event.params.swapFee != ZERO) {
    let marketId = Entity.getIDFromAddress(event.params.market)
    let positionId = Entity.getPositionID(marketId, event.params.positionId.toI32())

    let tradeid = Entity.getTradeIDFromPositionID(positionId, event.transaction.hash)
    let trade = Trade.load(tradeid) as Trade

    trade.externalSwapFees = event.params.swapFee
    trade.save()
  }
}
