const sodium = require('sodium-universal')
const assert = require('nanoassert')
const bint = require('bint8array')
const CipherState = require('./cipher')
const curve = require('./dh')
const { HASHLEN, hkdf } = require('./hkdf')

module.exports = class SymmetricState extends CipherState {
  constructor (opts = {}) {
    super()

    this.curve = opts.curve || curve
    this.digest = new Uint8Array(HASHLEN)
    this.chainingKey = null
    this.offset = 0

    this.DH_ALG = this.curve.ALG
  }

  mixHash (data) {
    accumulateDigest(this.digest, data)
  }

  mixKey (pubkey, seckey) {
    const dh = this.curve.dh(pubkey, seckey)
    const hkdfResult = hkdf(this.chainingKey, dh)
    this.chainingKey = hkdfResult[0]
    this.initialiseKey(hkdfResult[1].subarray(0, 32))
  }

  encryptAndHash (plaintext) {
    const ciphertext = this.encrypt(plaintext, this.digest)
    accumulateDigest(this.digest, ciphertext)
    return ciphertext
  }

  decryptAndHash (ciphertext) {
    const plaintext = this.decrypt(ciphertext, this.digest)
    accumulateDigest(this.digest, ciphertext)
    return plaintext
  }

  getHandshakeHash (out) {
    if (!out) return this.getHandshakeHash(new Uint8Array(HASHLEN))
    assert(out.byteLength === HASHLEN, `output must be ${HASHLEN} bytes`)

    out.set(this.digest)
    return out
  }

  split () {
    const res = hkdf(this.chainingKey, new Uint8Array(0))
    return res.map(k => k.subarray(0, 32))
  }

  _clear () {
    super._clear()

    sodium.sodium_memzero(this.digest)
    sodium.sodium_memzero(this.chainingKey)

    this.digest = null
    this.chainingKey = null
    this.offset = null

    this.curve = null
  }

  static get alg () {
    return CipherState.alg + '_BLAKE2b'
  }
}

function accumulateDigest (digest, input) {
  const toHash = bint.concat([digest, input])
  sodium.crypto_generichash(digest, toHash)
}
