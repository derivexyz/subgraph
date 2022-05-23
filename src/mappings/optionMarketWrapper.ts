import { CollateralUpdate, Trade } from '../../generated/schema'
import { PositionTraded } from '../../generated/templates/OptionMarketWrapper/OptionMarketWrapper'
import { Entity, ZERO } from '../lib'

//Handles external swap fees
export function handlePositionTraded(event: PositionTraded): void {
  if (event.params.swapFee != ZERO) {
    let marketId = Entity.getIDFromAddress(event.params.market)
    let positionId = Entity.getPositionID(marketId, event.params.positionId.toI32())
    if (event.params.isLong) {
      let tradeid = Entity.getTradeIDFromPositionID(positionId, event.transaction.hash)
      let trade = Trade.load(tradeid) as Trade

      trade.externalSwapFees = event.params.swapFee
      trade.externalSwapAddress = event.params.token
      trade.save()
    } else {
      let collateralUpdateID = Entity.getCollateralUpdateID(
        marketId,
        event.params.positionId.toI32(),
        event.transaction.hash,
      )
      let collateralUpdate = CollateralUpdate.load(collateralUpdateID) as CollateralUpdate

      collateralUpdate.externalSwapFees = event.params.swapFee
      collateralUpdate.externalSwapAddress = event.params.token
      collateralUpdate.save()
    }
  }
}
