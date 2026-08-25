import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LISTING_IMAGES_BUCKET = "listing-images";

async function deleteUserListingImages(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const bucket = admin.storage.from(LISTING_IMAGES_BUCKET);

  // Listing images are stored directly under `${userId}/...`.
  // Remove in batches from offset 0 because each successful removal shrinks
  // the remaining list.
  for (;;) {
    const { data, error } = await bucket.list(userId, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`storage_list_failed:${error.message}`);
    }

    if (!data || data.length === 0) {
      return;
    }

    const paths = data
      .filter((item) => Boolean(item.name))
      .map((item) => `${userId}/${item.name}`);

    if (paths.length === 0) {
      return;
    }

    const { error: removeError } = await bucket.remove(paths);
    if (removeError) {
      throw new Error(`storage_remove_failed:${removeError.message}`);
    }

    if (data.length < 100) {
      return;
    }
  }
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "サーバー側の設定が未完了です。" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "認証が必要です。" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Validate the access token so this endpoint can only delete the caller's own
  // account. Never accept a user id from the request body.
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "認証に失敗しました。" }, { status: 401 });
  }

  // Storage objects do not participate in PostgreSQL FK cascades. Delete the
  // user's marketplace images explicitly before deleting the Auth user.
  try {
    await deleteUserListingImages(admin, user.id);
  } catch (error) {
    console.error("account deletion: listing image cleanup failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          "掲載画像の削除に失敗したため、アカウント削除を中止しました。時間をおいて再度お試しください。",
      },
      { status: 500 },
    );
  }

  // The database migration makes profile-owned rows cascade (or SET NULL for
  // retained moderation provenance), so deleting auth.users becomes the single
  // authoritative account-deletion operation.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error("account deletion: auth user delete failed", {
      userId: user.id,
      error: deleteError.message,
    });
    return NextResponse.json(
      { ok: false, error: "アカウントの削除に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
