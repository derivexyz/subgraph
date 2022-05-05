import { BigIntHelper, ONE, UNIT } from '.'
import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

export namespace BlackScholes {
  export class AllGreeks {
    callPrice: BigInt
    putPrice: BigInt
    callDelta: BigInt
    putDelta: BigInt
    callTheta: BigInt
    putTheta: BigInt
    callRho: BigInt
    putRho: BigInt
    vega: BigInt
    gamma: BigInt
  }

  // ERF Coeffs
  const P0: number[] = [
    3.1611237438705656, 1.13864154151050156e2, 3.77485237685302021e2, 3.20937758913846947e3, 1.85777706184603153e-1,
  ]
  const Q0: number[] = [2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3, 2.84423683343917062e3]

  const P1: number[] = [
    5.64188496988670089e-1, 8.88314979438837594, 6.61191906371416295e1, 2.98635138197400131e2, 8.8195222124176909e2,
    1.71204761263407058e3, 2.05107837782607147e3, 1.23033935479799725e3, 2.15311535474403846e-8,
  ]
  const Q1: number[] = [
    1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2, 1.62138957456669019e3, 3.29079923573345963e3,
    4.36261909014324716e3, 3.43936767414372164e3, 1.23033935480374942e3,
  ]
  const P2: number[] = [
    3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2,
    6.58749161529837803e-4, 1.63153871373020978e-2,
  ]
  const Q2: number[] = [
    2.56852019228982242, 1.87295284992346047, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3,
  ]

  export function stdNormalCDF(x: number): number {
    return (1.0 - erf(-x / Math.sqrt(2))) / 2.0
  }

  export function stdNormal(x: number): number {
    return Math.exp((-x * x) / 2.0) / Math.sqrt(2.0 * Math.PI)
  }

  export function d1(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return (Math.log(spot / strikePrice) + (rate + (vol * vol) / 2.0) * tAnnualised) / (vol * Math.sqrt(tAnnualised))
  }

  export function d2(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return d1(tAnnualised, vol, spot, strikePrice, rate) - vol * Math.sqrt(tAnnualised)
  }

  export function PV(value: number, rate: number, tAnnualised: number): number {
    return value * Math.exp(-rate * tAnnualised)
  }

  export function callPrice(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return (
      stdNormalCDF(d1(tAnnualised, vol, spot, strikePrice, rate)) * spot -
      stdNormalCDF(d2(tAnnualised, vol, spot, strikePrice, rate)) * PV(strikePrice, rate, tAnnualised)
    )
  }

  export function putPrice(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return (
      stdNormalCDF(-d2(tAnnualised, vol, spot, strikePrice, rate)) * PV(strikePrice, rate, tAnnualised) -
      stdNormalCDF(-d1(tAnnualised, vol, spot, strikePrice, rate)) * spot
    )
  }

  export function callDelta(
    timeToExpiry: number,
    vol: number,
    spot: number,
    strikePrice: number,
    rate: number,
  ): number {
    let tAnnualised = f64(timeToExpiry) / f64(60 * 60 * 24 * 365)
    return stdNormalCDF(d1(tAnnualised, vol, spot, strikePrice, rate))
  }

  export function putDelta(timeToExpiry: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    let tAnnualised = f64(timeToExpiry) / f64(60 * 60 * 24 * 365)
    return callDelta(tAnnualised, vol, spot, strikePrice, rate) - 1.0
  }

  export function vega(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return spot * stdNormal(d1(tAnnualised, vol, spot, strikePrice, rate)) * Math.sqrt(tAnnualised)
  }

  export function gamma(tAnnualised: number, vol: number, spot: number, strikePrice: number, rate: number): number {
    return stdNormal(d1(tAnnualised, vol, spot, strikePrice, rate)) / (spot * vol * Math.sqrt(tAnnualised))
  }

  export function theta(
    tAnnualized: number,
    vol: number,
    spot: number,
    strikePrice: number,
    rate: number,
    isCall: boolean,
  ): number {
    if (isCall) {
      return (
        (-spot * stdNormal(d1(tAnnualized, vol, spot, strikePrice, rate)) * vol) / (2 * Math.sqrt(tAnnualized)) -
        rate * strikePrice * Math.exp(-rate * tAnnualized) * stdNormalCDF(d2(tAnnualized, vol, spot, strikePrice, rate))
      )
    } else {
      return (
        (-spot * stdNormal(d1(tAnnualized, vol, spot, strikePrice, rate)) * vol) / (2 * Math.sqrt(tAnnualized)) +
        rate *
          strikePrice *
          Math.exp(-rate * tAnnualized) *
          stdNormalCDF(-d2(tAnnualized, vol, spot, strikePrice, rate))
      )
    }
  }

  export function rho(
    tAnnualised: number,
    vol: number,
    spot: number,
    strikePrice: number,
    rate: number,
    isCall: boolean,
  ): number {
    if (isCall) {
      return (
        strikePrice *
        tAnnualised *
        Math.exp(-rate * tAnnualised) *
        stdNormalCDF(d2(tAnnualised, vol, spot, strikePrice, rate))
      )
    } else {
      return (
        -strikePrice *
        tAnnualised *
        Math.exp(-rate * tAnnualised) *
        stdNormalCDF(-d2(tAnnualised, vol, spot, strikePrice, rate))
      )
    }
  }

  export function getBlackScholesPrice(
    timeToExpirySeconds: i32,
    vol: BigInt,
    spotPrice: BigInt,
    strikePrice: BigInt,
    rateAndCarry: BigInt,
    isCall: boolean,
  ): BigInt {
    let timeToExpiryAnnualized = f64(timeToExpirySeconds) / f64(60 * 60 * 24 * 365)
    let _vol = BigIntHelper.toNumber(vol, 18)
    let _spotPrice = BigIntHelper.toNumber(spotPrice, 18)
    let _strikePrice = BigIntHelper.toNumber(strikePrice, 18)
    let _rateAndCarry = BigIntHelper.toNumber(rateAndCarry, 18)
    let price = BlackScholes.price(timeToExpiryAnnualized, _vol, _spotPrice, _strikePrice, _rateAndCarry, isCall)

    return convertToBigNum(price)
  }

  export function calculateGreeks(
    timeToExpirySeconds: i32,
    vol: BigInt,
    spotPrice: BigInt,
    strikePrice: BigInt,
    rateAndCarry: BigInt,
  ): AllGreeks {
    let tAnnualised = f64(timeToExpirySeconds) / f64(31536000) // 60 * 60 * 24 * 365 (seconds per year)
    let _vol = BigIntHelper.toNumber(vol, 18)
    let _spotPrice = BigIntHelper.toNumber(spotPrice, 18)
    let _strikePrice = BigIntHelper.toNumber(strikePrice, 18)
    let _rateAndCarry = BigIntHelper.toNumber(rateAndCarry, 18)

    //INPUTS
    let d1_ = d1(tAnnualised, _vol, _spotPrice, _strikePrice, _rateAndCarry)
    let d2_ = d2(tAnnualised, _vol, _spotPrice, _strikePrice, _rateAndCarry)
    let stdNormalCDF_d1 = stdNormalCDF(d1_)
    let stdNormalCDF_d2 = stdNormalCDF(d2_)
    let neg_stdNormalCDF_d2 = stdNormalCDF(-d2_)
    let stdNormal_d1 = stdNormal(d1_)
    let tAnnualised_sqrt = Math.sqrt(tAnnualised)
    let PV_ = PV(_strikePrice, _rateAndCarry, tAnnualised)

    let callPrice = convertToBigNum(stdNormalCDF_d1 * _spotPrice - stdNormalCDF_d2 * PV_)
    let putPrice = convertToBigNum(neg_stdNormalCDF_d2 * PV_ - stdNormalCDF(-d1_) * _spotPrice)
    let callDelta = convertToBigNum(stdNormalCDF_d1)
    let putDelta = callDelta.minus(UNIT)

    let theta_p1 = (-_spotPrice * stdNormal_d1 * _vol) / (2 * tAnnualised_sqrt)
    let theta_p2 = _rateAndCarry * _strikePrice * Math.exp(-_rateAndCarry * tAnnualised)
    let callTheta = convertToBigNum(theta_p1 - theta_p2 * stdNormalCDF_d2)
    let putTheta = convertToBigNum(theta_p1 + theta_p2 * neg_stdNormalCDF_d2)

    let rho_p1 = _strikePrice * tAnnualised * Math.exp(-_rateAndCarry * tAnnualised)
    let callRho = convertToBigNum(rho_p1 * stdNormalCDF_d2)
    let putRho = convertToBigNum(-rho_p1 * neg_stdNormalCDF_d2)

    let vega = convertToBigNum(_spotPrice * stdNormal_d1 * tAnnualised_sqrt)
    let gamma = convertToBigNum(stdNormal_d1 / (_spotPrice * _vol * tAnnualised_sqrt))

    return { callPrice, putPrice, callDelta, putDelta, callTheta, putTheta, callRho, putRho, vega, gamma }
  }

  function convertToBigNum(num: number): BigInt {
    // For some reason there's extra precision, so multiply by unit and divide by unit later to clear it...
    let numDec = BigDecimal.fromString(num.toString())
      .times(UNIT.toBigDecimal())
      .times(UNIT.toBigDecimal())
      .truncate(0)
      .toString()
    return BigInt.fromString(numDec).div(UNIT)
  }

  export function price(
    tAnnualised: number,
    vol: number,
    spot: number,
    strike: number,
    rate: number,
    isCall: boolean,
  ): number {
    return isCall ? callPrice(tAnnualised, vol, spot, strike, rate) : putPrice(tAnnualised, vol, spot, strike, rate)
  }

  export function erf_(x: number): number {
    // constants
    let a1 = 0.254829592
    let a2 = -0.284496736
    let a3 = 1.421413741
    let a4 = -1.453152027
    let a5 = 1.061405429
    let p = 0.3275911

    // Save the sign of x
    let sign = 1
    if (x < 0) {
      sign = -1
    }
    x = Math.abs(x)

    // A&S formula 7.1.26
    let t = 1.0 / (1.0 + p * x)
    let y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

    return sign * y
    // }
  }

  function erf1(y: number): number {
    let ysq = y * y
    let xnum = P0[4] * ysq
    let xden = ysq
    let i: i32

    for (i = 0; i < 3; i += 1) {
      xnum = (xnum + P0[i]) * ysq
      xden = (xden + Q0[i]) * ysq
    }
    return (y * (xnum + P0[3])) / (xden + Q0[3])
  }

  function erfc2(y: number): number {
    let xnum = P1[8] * y
    let xden = y
    let i: i32

    for (i = 0; i < 7; i += 1) {
      xnum = (xnum + P1[i]) * y
      xden = (xden + Q1[i]) * y
    }
    let result = (xnum + P1[7]) / (xden + Q1[7])
    let ysq = Math.floor(y * 16) / 16
    let del = (y - ysq) * (y + ysq)
    return Math.exp(-ysq * ysq) * Math.exp(-del) * result
  }

  function erfc3(y: number): number {
    let ysq = 1 / (y * y)
    let xnum = P2[5] * ysq
    let xden = ysq
    let i: i32

    for (i = 0; i < 4; i += 1) {
      xnum = (xnum + P2[i]) * ysq
      xden = (xden + Q2[i]) * ysq
    }
    let result = (ysq * (xnum + P2[4])) / (xden + Q2[4])
    result = (5.6418958354775628695e-1 - result) / y
    ysq = Math.floor(y * 16) / 16 //TODO: Remove Math.floor?
    let del = (y - ysq) * (y + ysq)
    return Math.exp(-ysq * ysq) * Math.exp(-del) * result
  }

  //Based on mathjs.erf implemenation
  export function erf(x: number): number {
    let MAX_NUM = Math.pow(2, 53)

    let y = Math.abs(x)

    if (y >= MAX_NUM) {
      return Math.sign(x)
    }
    if (y <= 0.46875) {
      return Math.sign(x) * erf1(y)
    }
    if (y <= 4.0) {
      return Math.sign(x) * (1 - erfc2(y))
    }
    return Math.sign(x) * (1 - erfc3(y))
  }
}
