import { randomUUID } from 'crypto'

export type SocialAccountForPublish = {
  platform: string
  platform_account_id: string | null
  access_token: string | null
}

export type SocialPostForPublish = {
  caption: string
  image_url: string | null
}

export type PublishResult =
  | { ok: true; platformPostId: string }
  | { ok: false; error: string }

const GRAPH_API_VERSION = 'v21.0'

// No Meta/TikTok developer app is configured in this repo (no
// FACEBOOK_APP_ID in any .env.example), so social_accounts.access_token is
// always null today — every connection is the mock one created by
// POST /api/social-accounts (see routes/social-accounts.ts). This function
// still contains the real Graph API call, gated on a real access token
// being present, so plugging in a real OAuth flow later only requires
// wiring social_accounts.access_token — no changes here.
export async function publishToPlatform(
  account: SocialAccountForPublish,
  post: SocialPostForPublish,
): Promise<PublishResult> {
  if (!account.access_token) {
    return { ok: true, platformPostId: `mock_${randomUUID()}` }
  }

  switch (account.platform) {
    case 'facebook':
      return publishFacebookPost(account, post)
    default:
      // Instagram (Content Publishing API, needs a two-step container→publish
      // flow) and TikTok (immature public API per §7 of the plan doc) aren't
      // implemented yet even with a real token.
      return { ok: false, error: `Publishing to ${account.platform} is not implemented yet` }
  }
}

async function publishFacebookPost(
  account: SocialAccountForPublish,
  post: SocialPostForPublish,
): Promise<PublishResult> {
  if (!account.platform_account_id) {
    return { ok: false, error: 'Facebook Page ID is missing on this connected account' }
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.platform_account_id}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: post.caption,
          ...(post.image_url ? { link: post.image_url } : {}),
          access_token: account.access_token,
        }),
      },
    )
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
    if (!res.ok) {
      return { ok: false, error: body.error?.message ?? `Graph API error ${res.status}` }
    }
    return { ok: true, platformPostId: body.id ?? `unknown_${randomUUID()}` }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Graph API request failed' }
  }
}
