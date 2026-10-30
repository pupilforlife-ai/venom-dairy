-- Synthetic arithmetic and source-genealogy tests; no operational writes.
do $test$
declare rounds jsonb:='[]'; lots jsonb; creams jsonb; req jsonb; result jsonb; second_result jsonb; bad jsonb; x numeric; i integer:=0;
begin
  foreach x in array array[33.4,26.8,40.8,29.8,19.4,36.7,26.5,38.2,36.1] loop
    i:=i+1; rounds:=rounds||jsonb_build_array(jsonb_build_object('id','b'||i,'type','Butter','status','churned',
      'creamSource','internal','milkLotId','ml','butterOutput',x,'remainingBalance',x));
  end loop;
  lots:='[{"id":"ml","lotCode":"261026","butterPool":{"totalButterProduced":287.7,"usedInGhee":0,"usedInBlending":0,"packedAsPubb":0,"availableBalance":287.7}}]';
  req:='{"operationId":"one","butterSource":"milk:ml","butterInput":92.5,"roundDate":"2026-10-30","team":"A, B"}';
  result:=public.prepare_ghee_round(rounds,lots,'[]',req,'staff','2026-10-30T08:00:00Z');
  if (result#>>'{milkLot,butterPool,availableBalance}')::numeric<>195.2 or (result#>>'{round,afOilInput}')::numeric<>12.5
    or (result#>>'{round,expectedYield}')::numeric<>73.5 or result#>>'{round,roundNumber}'<>'1' then raise exception 'First 92.5 kg calculation failed'; end if;
  second_result:=public.prepare_ghee_round(result->'rounds',jsonb_build_array(result->'milkLot'),'[]',req||'{"operationId":"two"}','staff',now());
  if (second_result#>>'{milkLot,butterPool,availableBalance}')::numeric<>102.7
    or (second_result#>>'{milkLot,butterPool,usedInGhee}')::numeric<>185
    or (select sum((r->>'remainingBalance')::numeric) from jsonb_array_elements(second_result->'rounds') r where r->>'type'='Butter')<>102.7
    or jsonb_array_length(second_result->'rounds')<>11 or second_result#>>'{round,roundNumber}'<>'2' then raise exception 'Two rounds must leave 102.7 kg'; end if;
  result:=public.prepare_ghee_round(second_result->'rounds',jsonb_build_array(second_result->'milkLot'),'[]',req||'{"operationId":"two"}','staff',now());
  if not (result->>'replayed')::boolean or result->'rounds'<>second_result->'rounds' then raise exception 'Retry duplicated ghee or deductions'; end if;
  for bad in select value from jsonb_array_elements('[null,"NaN","Infinity","92.5",0,-1]') loop
    begin
      perform public.prepare_ghee_round(rounds,lots,'[]',req||jsonb_build_object('butterInput',bad),'staff',now());
      raise exception 'Invalid quantity accepted';
    exception when others then if sqlerrm<>'Enter a finite positive butter input' then raise; end if; end;
  end loop;
  result:=public.prepare_ghee_round(rounds,lots,'[]',req||'{"butterInput":320}','staff',now());
  if (result#>>'{round,butterOverdrawKg}')::numeric<>32.3 or (result#>>'{round,butterInput}')::numeric<>320 then raise exception 'Physical overdraw should remain recordable'; end if;
  creams:='[{"id":"cream","lotCode":"GG-301026"}]';
  rounds:=rounds||'[{"id":"blend","type":"Butter","status":"psbbb_pool","blendedPoolId":"blend","creamSource":"internal","milkLotId":"ml","butterOutput":999,"remainingBalance":999},
    {"id":"other","type":"Butter","status":"churned","creamSource":"internal","milkLotId":"other","butterOutput":999,"remainingBalance":999},
    {"id":"external","type":"Butter","status":"churned","creamSource":"external","creamLotId":"cream","butterOutput":100,"remainingBalance":100}]'::jsonb;
  result:=public.prepare_ghee_round(rounds,lots,creams,req||'{"butterSource":"cream:cream"}','staff',now());
  if result->'milkLot'<>'null'::jsonb or result#>>'{round,milkLotId}'<>'' or result#>>'{round,sourceCreamLotId}'<>'cream'
    or jsonb_array_length(result->'sourceRounds')<>1 or result#>>'{sourceRounds,0,id}'<>'external' then raise exception 'External cream mixed with milk/blends'; end if;
  result:=public.prepare_ghee_round(rounds,lots,creams,req||'{"butterInput":300}','staff',now());
  if (result#>>'{round,butterOverdrawKg}')::numeric<>12.3 then raise exception 'Other lots and blended butter must not cover internal input'; end if;
  if exists(select 1 from jsonb_array_elements(result->'sourceRounds') r where r->>'id' in ('blend','other','external')) then raise exception 'Unrelated source changed'; end if;
end;
$test$;
select 'Ghee arithmetic, 287.7-185=102.7, finite validation, source isolation, physical overdraw and retry checks passed; synthetic data only' as result;
