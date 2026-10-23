import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { createHash } from 'node:crypto'
import { compare, hash } from 'bcryptjs'

const KEY_LENGTH = 64
const SALT_LENGTH = 16
const BCRYPT_COST = 12

function prehashPassword(password: string): string {
  return createHash('sha256').update('tobi-password\0').update(password).digest('hex')
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  return `bcrypt-sha256$${await hash(prehashPassword(password), BCRYPT_COST)}`
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (encodedHash.startsWith('bcrypt-sha256$')) {
    return compare(prehashPassword(password), encodedHash.slice('bcrypt-sha256$'.length))
  }

  if (!encodedHash.startsWith('scrypt$')) {
    if (Buffer.byteLength(password, 'utf8') > 72) return false
    return compare(password, encodedHash)
  }

  const parts = encodedHash.split('$')
  if (parts.length !== 3) return false
  const [, encodedSalt, encodedKey] = parts
  if (!/^[A-Za-z0-9_-]+$/.test(encodedSalt) || !/^[A-Za-z0-9_-]+$/.test(encodedKey)) return false

  const salt = Buffer.from(encodedSalt, 'base64url')
  const expectedKey = Buffer.from(encodedKey, 'base64url')
  if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) return false

  const actualKey = await deriveKey(password, salt)
  return timingSafeEqual(actualKey, expectedKey)
}
