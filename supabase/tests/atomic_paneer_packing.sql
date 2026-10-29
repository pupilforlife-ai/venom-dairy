-- Synthetic data only; no operational record writes.
do $tests$
declare r jsonb; request jsonb; result jsonb; result2 jsonb; old_pack jsonb; legacy jsonb; spec record;
begin
  r:='{"id":"r","milkLotCode":"test","shiftNumber":5,"roundNumber":3,"type":"C/S","status":"frozen","outputWeight":70.097,"historyEvents":[],"blockWeights":[70.097],"cuttingType":"400g cubes"}';
  request:='{"operationId":"one","roundId":"r","sku":"RPAN100","cases":3,"loose":0}';
  result:=public.prepare_paneer_packing(r,'[]',request,'test staff','staff','2026-10-29T12:00:00Z');
  if result#>>'{round,remainingBalance}'<>'25.097000' or result#>>'{stock,totalPackets}'<>'45' then raise exception '3 cases must be 45kg / 45 packets'; end if;
  if result#>'{round,blockWeights}'<>r->'blockWeights' or result#>>'{round,packedSkus,0,recordedBy}'<>'test staff' then raise exception 'Source/audit preservation failed'; end if;
  result2:=public.prepare_paneer_packing(result->'round',jsonb_build_array(result->'stock'),request,'test staff','staff',now());
  if not (result2->>'replayed')::boolean or result2->'round'<>result->'round' then raise exception 'Retry duplicated packing'; end if;
  request:=request||'{"operationId":"two","cases":2}';
  result2:=public.prepare_paneer_packing(result->'round',jsonb_build_array(result->'stock'),request,'second staff','staff',now());
  if jsonb_array_length(result2#>'{round,packedSkus}')<>2 or (result2#>>'{round,remainingBalance}')::numeric<>-4.903 then raise exception 'Concurrent append/overdraw arithmetic failed'; end if;
  old_pack:=result2#>'{round,packedSkus,0}';
  request:=request||jsonb_build_object('operationId','correct','packIndex',0,'expectedPack',old_pack,'cases',0);
  begin
    perform public.prepare_paneer_packing(result2->'round',jsonb_build_array(result->'stock',result2->'stock'),request,'staff','staff',now());
    raise exception 'Staff correction accepted';
  exception when others then if sqlerrm<>'Only the owner can correct recorded packing' then raise; end if; end;
  result:=public.prepare_paneer_packing(result2->'round',jsonb_build_array(result->'stock',result2->'stock'),request,'owner','owner',now());
  if (result#>>'{round,remainingBalance}')::numeric<>40.097 or result#>>'{stock,id}'<>'fs-one' or result#>>'{stock,cases}'<>'0' then raise exception 'Owner zero correction did not retain identity/restore balance'; end if;
  begin
    perform public.prepare_paneer_packing(result->'round',jsonb_build_array(result->'stock'),request||'{"operationId":"stale-correction"}','owner','owner',now());
    raise exception 'Stale correction accepted';
  exception when others then if sqlerrm not like 'This packing entry changed.%' then raise; end if; end;
  request:='{"operationId":"weighted","roundId":"r","sku":"RPAN010","cases":2,"loose":0,"caseWeightKg":30,"looseWeightKg":4}';
  result:=public.prepare_paneer_packing(r||'{"cuttingType":"Restaurant blocks"}','[]',request,'staff','staff',now());
  if (result#>>'{round,remainingBalance}')::numeric<>6.097 or result#>>'{stock,caseWeightKg}'<>'30' then raise exception 'Custom case weights failed'; end if;
  begin
    perform public.prepare_paneer_packing(r,'[]',request,'staff','staff',now());
    raise exception 'Wrong cut allowed';
  exception when others then if sqlerrm not like 'That SKU is not permitted%' then raise; end if; end;
  for spec in select * from (values
    ('MPAN100','D',15::numeric),('MPAN200','D',4.8),('VJPAN','D',4),('MPAN400','D',9.6),
    ('MPAN101','D',15),('MPAN101 SPC CUT','D',15),('YD200','D',7.2),
    ('RPAN100','C/S',15),('RPAN200','C/S',4.8),('RPAN400','C/S',9.6),
    ('RPAN100 Rylands','C/S',15),('RPAN400 Rylands','C/S',9.6),('RPAN101','C/S',15),('RPAN101 SPC CUT','C/S',15)
  ) v(sku,kind,kg) loop
    result:=public.prepare_paneer_packing((r-'cuttingType')||jsonb_build_object('type',spec.kind),'[]',
      jsonb_build_object('operationId',spec.sku,'roundId','r','sku',spec.sku,'cases',1,'loose',0),'staff','staff',now());
    if (result#>>'{round,remainingBalance}')::numeric<>70.097-spec.kg then raise exception 'Wrong SKU mass: %',spec.sku; end if;
  end loop;
  if public.paneer_packed_weight('{"sku":"PAN101","cases":1,"loose":0}')<>15 then raise exception 'Legacy alias failed'; end if;
  request:='{"operationId":"fresh","roundId":"r","sku":"RPAN100","cases":1,"loose":0}';
  result:=public.prepare_paneer_packing(r||'{"sppRecordedWeight":10}','[]',request,'staff','staff',now());
  if (result#>>'{round,remainingBalance}')::numeric<>45.097 then raise exception 'SPP deduction failed'; end if;
  begin
    perform public.prepare_paneer_packing(r,'[]',request||'{"cases":-1}','staff','staff',now());
    raise exception 'Negative packing accepted';
  exception when others then if sqlerrm not like 'Enter valid non-negative%' then raise; end if; end;
  begin
    perform public.prepare_paneer_packing(r,'[]',request||'{"cases":0}','staff','staff',now());
    raise exception 'New zero packing accepted';
  exception when others then if sqlerrm<>'Enter a packed quantity' then raise; end if; end;
  begin
    perform public.prepare_paneer_packing(r||'{"locked":true}','[]',request,'staff','staff',now());
    raise exception 'Locked round accepted';
  exception when others then if sqlerrm<>'This round is not available for packing' then raise; end if; end;
  begin
    perform public.prepare_paneer_packing(r,'[{"id":"fs-fresh","packingRunId":"other-round"}]',request,'staff','staff',now());
    raise exception 'Cross-round stock identity collision accepted';
  exception when others then if sqlerrm not like 'Packing operation identity is already used%' then raise; end if; end;
  -- An owner can correct an old handed-over line, but its actual location,
  -- identity and movement history must not be reset to awaiting handover.
  old_pack:='{"sku":"RPAN100","cases":3,"loose":0}';
  legacy:='{"id":"old-stock","packingRunId":"legacy-r-0","sku":"RPAN100","cases":3,"loosePackets":0,"status":"handed_over","storageLocation":"Distribution Coldroom","handedOverQuantity":45}';
  result:=public.prepare_paneer_packing(r||jsonb_build_object('packedSkus',jsonb_build_array(old_pack)),jsonb_build_array(legacy),
    request||jsonb_build_object('packIndex',0,'expectedPack',old_pack,'cases',2),'owner','owner',now());
  if result#>>'{stock,id}'<>'old-stock' or result#>>'{stock,status}'<>'handed_over' or result#>>'{stock,storageLocation}'<>'Distribution Coldroom'
    or result#>>'{stock,handedOverQuantity}'<>'45' then raise exception 'Legacy transfer evidence lost'; end if;
end;
$tests$;
select 'Atomic paneer packing synthetic arithmetic, permissions, correction, retry, legacy, and lot-isolation checks passed' as result;
