import path from 'path'
const script = process.argv[2]
const main = require(path.join(__dirname, script + '.ts')).main
main().then(() => console.log('Done'))
