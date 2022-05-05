import { BigInt } from '@graphprotocol/graph-ts'
import { ZERO } from '.'

export namespace BigIntHelper {
  export function toNumber(value: BigInt, decimals: i32 = 18): number {
    let multiplier = BigInt.fromString('1' + '0'.repeat(decimals))

    let negative = value.lt(ZERO)
    if (negative) {
      value = value.neg()
    }

    let fraction = value.mod(multiplier).toString()
    while (fraction.length < multiplier.toString().length - 1) {
      fraction = '0' + fraction
    }
    if (fraction.startsWith('0')) {
      fraction = '0'
    } else {
      let newFraction = ''
      for (let i = 0; i < fraction.length; i++) {
        if (fraction[i] == '0') {
          break
        }
        newFraction += fraction[i]
      }
      fraction = newFraction
    }

    let whole = value.div(multiplier).toString()

    let valueStr = ''
    if (multiplier.toString().length === 1) {
      valueStr = whole
    } else {
      valueStr = whole + '.' + fraction
    }

    if (negative) {
      valueStr = '-' + value.toString()
    }

    return parseFloat(valueStr)
  }
}
