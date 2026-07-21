import 'dotenv/config';
import { db } from './lib/db';

async function main() {
  try {
    console.log("Connecting to DB...");
    const res = await db.query('SELECT id, user_id FROM career_profiles LIMIT 5');
    console.log("Career Profiles:", res.rows);
    
    if (res.rows.length === 0) {
      console.log("No career profiles found. Querying users...");
      const usersRes = await db.query('SELECT id FROM users LIMIT 5');
      console.log("Users:", usersRes.rows);
    }

    // Now test a simple query on scraped_jobs
    console.log("Checking scraped_jobs count...");
    const scrapedCount = await db.query('SELECT COUNT(*) FROM scraped_jobs');
    console.log("Scraped jobs count:", scrapedCount.rows[0]);

    // Test the exact logic in scraped-jobs route
    const userId = res.rows[0]?.user_id || 'some-dummy-uuid';
    console.log(`Running simulation for user: ${userId}`);
    
    const { rows: [profile] } = await db.query(
      'SELECT target_roles, target_industries FROM career_profiles WHERE user_id = $1',
      [userId]
    );
    console.log("Profile retrieved:", profile);
    
    const terms = [
      ...(profile?.target_roles ?? []),
      ...(profile?.target_industries ?? []),
    ].map((t: string) => t.toLowerCase());
    console.log("Terms:", terms);

    const limit = 50;
    const offset = 0;
    const params: any[] = [new Date(Date.now())];
    const conditions: string[] = ['sj.expires_at > $1'];
    const where = conditions.join(' AND ');

    const relevanceExpr = terms.length > 0
      ? `CASE WHEN ${terms.map((_, i) => {
          params.push(`%${terms[i]}%`);
          const idx = params.length;
          return `(sj.title ILIKE $${idx} OR sj.location ILIKE $${idx})`;
        }).join(' OR ')} THEN 0 ELSE 1 END`
      : '0';

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    console.log("Where clause:", where);
    console.log("Relevance expr:", relevanceExpr);
    console.log("Params:", params);

    const queryStr = `SELECT sj.id, sj.source, sj.source_url, sj.title, sj.company, sj.location,
              sj.job_type, sj.salary_range, sj.skills, sj.posted_at, sj.scraped_at
       FROM scraped_jobs sj
       WHERE ${where}
       ORDER BY ${relevanceExpr}, sj.scraped_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    
    console.log("Executing jobs query...");
    const jobsRes = await db.query(queryStr, params);
    console.log(`Found ${jobsRes.rows.length} jobs.`);

    console.log("Executing count query...");
    const countQueryStr = `SELECT COUNT(*) FROM scraped_jobs WHERE ${where}`;
    const countParams = params.slice(0, params.length - 2);
    console.log("Count Query Str:", countQueryStr);
    console.log("Count Params:", countParams);
    
    const countRes = await db.query(countQueryStr, countParams);
    console.log("Count result:", countRes.rows[0]);

  } catch (err) {
    console.error("ERROR EXECUTING QUERY:", err);
  } finally {
    await db.end();
  }
}

main();
