let SECONDS_IN_5_MIN = 300
let SECONDS_IN_HOUR = 3600
let SECONDS_IN_DAY = SECONDS_IN_HOUR * 24

export namespace Snapshot {
  export function getHourlySnapshotID(prefix: string, timestamp: i32): string {
    let day = Math.floor(timestamp / SECONDS_IN_DAY)
    let timeOfDay = timestamp - day * SECONDS_IN_DAY
    let hour = Math.floor(timeOfDay / SECONDS_IN_HOUR)
    return prefix + '-' + day.toString() + '-' + hour.toString()
  }

  export function getSnapshotID(prefix: string, period: i32, timestamp: i32): string {
    let periodId = timestamp / period
    let snapshotId = prefix + '-' + period.toString() + '-' + periodId.toString()
    return snapshotId
  }

  //Get timestamp at end of the period
  //Todo: Is this the best way to do this?
  export function roundTimestamp(timestamp: i32, period: i32): i32 {
    return timestamp + (period - (timestamp % period))
  }

  export function getDay(timestamp: i32): i32 {
    return i32(Math.floor(timestamp / SECONDS_IN_DAY))
  }

  export function getHour(timestamp: i32): i32 {
    let timeOfDay = timestamp - getDay(timestamp) * SECONDS_IN_DAY
    return i32(Math.floor(timeOfDay / SECONDS_IN_HOUR))
  }

  export function getFiveMinute(timestamp: i32): i32 {
    return timestamp / SECONDS_IN_5_MIN
  }
}
