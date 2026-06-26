import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

declare module 'next-auth' {
  interface Session {
    accessToken: string
    user: {
      id: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string
    userId: string
  }
}

const API_URL = process.env.API_URL || 'http://localhost:3000'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          })
          if (!res.ok) return null
          const { token, user } = await res.json()
          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            accessToken: token,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as typeof user & { accessToken: string }).accessToken
        token.userId = user.id as string
      }
      return token
    },
    session({ session, token }) {
      session.accessToken = token.accessToken
      session.user.id = token.userId
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
