DO $$
DECLARE u uuid := gen_random_uuid(); r uuid := gen_random_uuid(); result jsonb; n integer;
BEGIN
 INSERT INTO profiles(id,email) VALUES(u,'trial@example.test');
 result := consume_ai_prompt(u,r,1000);
 IF NOT (result->>'allowed')::boolean THEN RAISE EXCEPTION 'First prompt denied'; END IF;
 FOR n IN 2..41 LOOP
   IF NOT (consume_ai_prompt(u,r,1000)->>'allowed')::boolean THEN RAISE EXCEPTION 'Continuation denied'; END IF;
 END LOOP;
 IF (SELECT lifetime_usage FROM profiles WHERE id=u) <> 1 THEN RAISE EXCEPTION 'Steps consumed extra prompts'; END IF;
 IF (consume_ai_prompt(u,r,1000)->>'allowed')::boolean THEN RAISE EXCEPTION 'Step bound bypassed'; END IF;
 FOR n IN 2..5 LOOP
   IF NOT (consume_ai_prompt(u,gen_random_uuid(),1000)->>'allowed')::boolean THEN RAISE EXCEPTION 'Trial prompt denied'; END IF;
 END LOOP;
 IF (consume_ai_prompt(u,gen_random_uuid(),1000)->>'allowed')::boolean THEN RAISE EXCEPTION 'Sixth trial prompt accepted'; END IF;
 UPDATE profiles SET monthly_reset_at=now()-interval '2 months' WHERE id=u;
 IF (consume_ai_prompt(u,gen_random_uuid(),1000)->>'allowed')::boolean THEN RAISE EXCEPTION 'Lifetime trial reset'; END IF;
 UPDATE profiles SET is_pro=true WHERE id=u;
 r := gen_random_uuid();
 IF NOT (consume_ai_prompt(u,r,1)->>'allowed')::boolean THEN RAISE EXCEPTION 'Manual upgrade ineffective'; END IF;
 IF (consume_ai_prompt(u,gen_random_uuid(),1)->>'allowed')::boolean THEN RAISE EXCEPTION 'Pro quota bypassed'; END IF;
 UPDATE ai_prompt_runs SET created_at=now()-interval '3 hours' WHERE user_id=u AND prompt_id=r;
 IF (consume_ai_prompt(u,r,1)->>'allowed')::boolean THEN RAISE EXCEPTION 'Expired task accepted'; END IF;
 IF has_function_privilege('authenticated','consume_ai_prompt(uuid,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Public quota mutation enabled'; END IF;
END $$;
SELECT 'Quota assertions passed' AS result;
