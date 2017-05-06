var bitcoinutil = require('bitcoinutil')
var bluebird    = require('bluebird')
var bitcoin     = require('bitcoinjs-lib')
var REST        = require('rest.js')

var FEE_RATE    = 250

if(!process.argv[3]) return usage()

var privateKeyWIF = process.argv[2]
var networkName = privateKeyWIF[0] == 'K' || privateKeyWIF[0] == 'L' ? 'bitcoin' : 'testnet'
var network = bitcoin.networks[networkName || 'bitcoin']
var BASE_URI = networkName == 'bitcoin' ? 'https://insight.coinpit.io/insight-api' : 'https://insight.coinpit.me/insight-api'


return process.argv[4] ? signtx(privateKeyWIF, process.argv[3], process.argv[4]) : respend(privateKeyWIF, process.argv[3])

function signtx(privateKeyWIF, txid, rawtx) {
  bluebird.spawn(function*() {
    var tx = bitcoin.Transaction.fromHex(rawtx)
    var origtx = (yield REST.get(BASE_URI + '/tx/' + txid)).body
    var redeem = getRedeem(origtx.vin[0])
    console.log(bitcoinutil.sign(rawtx, privateKeyWIF, redeem))
  })
}

function usage() {
  return console.log('usage: respend privateKeyWIF txid [rawtx] ')
}

function respend(privateKeyWIF, txid) {
  bluebird.spawn(function*() {
    var tx = (yield REST.get(BASE_URI + '/tx/' + txid)).body
    var feeRate = Math.round(1e5* (yield REST.get(BASE_URI + '/utils/estimatefee')).body["2"])
    feeRate = Math.max(feeRate, FEE_RATE)
    var fee = feeRate * txsize(tx.vin.length, tx.vout.length)
    console.log('using fee', fee, 'rate', feeRate)
    var txb = new bitcoin.TransactionBuilder(network)
    var amount = 0
    tx.vin.forEach(input => {
      txb.addInput(input.txid, input.vout)
      amount += input.valueSat
    })
    amount -= fee
    tx.vout.forEach(out => {
      var destination = out.scriptPubKey.addresses[0]
      var value = Math.round(out.value * 1e8)
      txb.addOutput(destination, Math.min(amount, value))
      amount -= value
    })
    var redeem = getRedeem(tx.vin[0])
    sign(txb, privateKeyWIF, redeem)
    console.log(txb.buildIncomplete().toHex())
  })
}

function getRedeem(vin) {
  var scriptHex = vin.scriptSig.asm.split(" ").pop()
  var script = new Buffer(scriptHex, 'hex')
  return script
}

function sign(txb, privateKeyWIF, redeem) {
  if(!privateKeyWIF) return
  var key = bitcoin.ECPair.fromWIF(privateKeyWIF, network)
  for(var i = 0; i < txb.inputs.length; i++) {
    txb.sign(i, key, redeem)
  }
}

function txsize(inputs, outputs) {
  return 10 + inputs * 250 + outputs * 34
}
