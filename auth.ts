import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import connectToDatabase, { clientPromise, mongoUri } from './lib/mongodb'
import { verifyPassword } from './lib/password'
import User from './models/User'

const providers: NextAuthConfig['providers'] = [
  Credentials({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (
        typeof credentials?.email !== 'string'
        || typeof credentials.password !== 'string'
        || credentials.password.length === 0
      ) {
        return null
      }

      const email = credentials.email.trim().toLowerCase()
      await connectToDatabase()
      const user = await User.findOne({ email }).select('+passwordHash')

      if (!user?.passwordHash || !(await verifyPassword(credentials.password, user.passwordHash))) {
        return null
      }

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image,
      }
    },
  }),
]

const googleClientId = process.env.AUTH_GOOGLE_ID
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET
const googleSignInEnabled = Boolean(mongoUri && googleClientId && googleClientSecret)

if (googleSignInEnabled && googleClientId && googleClientSecret) {
  providers.unshift(Google({ clientId: googleClientId, clientSecret: googleClientSecret }))
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  providers,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  trustHost:
    process.env.NODE_ENV !== 'production'
    || process.env.AUTH_TRUST_HOST === 'true'
    || Boolean(process.env.VERCEL),
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return true
      if (!user.email || profile?.email_verified !== true) return false
      return true
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
})

export { googleSignInEnabled }
