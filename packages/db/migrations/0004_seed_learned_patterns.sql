-- Real trained data backfilled from the source trading bot's patternStore.json
-- / moonStore.json (87 labeled rugs, 100 labeled moons / 137 mediocre exits).
-- This is the actual "trained on labeled outcomes" data PROJECT.md refers to
-- for rugAnalyser/moonAnalyser — not synthetic.

insert into learned_patterns (id, kind, description, positive_count, negative_count, weight, last_seen) values
  ('top3_holders_above_50pct', 'rug', 'top3 holders above 50pct', 69, 0, 1.0, now()),
  ('single_holder_above_20pct', 'rug', 'single holder above 20pct', 72, 0, 1.0, now()),
  ('single_holder_above_10pct', 'rug', 'single holder above 10pct', 72, 0, 1.0, now()),
  ('liquidity_below_15sol', 'rug', 'liquidity below 15sol', 86, 0, 1.0, now()),
  ('liquidity_below_25sol', 'rug', 'liquidity below 25sol', 86, 0, 1.0, now()),
  ('holder_count_below_50', 'rug', 'holder count below 50', 73, 0, 1.0, now()),
  ('holder_count_below_100', 'rug', 'holder count below 100', 75, 0, 1.0, now()),
  ('rugged_within_5min', 'rug', 'rugged within 5min', 10, 0, 1.0, now()),
  ('entry_price_e4_range', 'rug', 'entry price e4 range', 20, 0, 1.0, now()),
  ('volume_5m_below_1k', 'rug', 'volume 5m below 1k', 44, 0, 1.0, now()),
  ('volume_5m_below_500', 'rug', 'volume 5m below 500', 43, 0, 1.0, now()),
  ('entry_score_below_70', 'rug', 'entry score below 70', 28, 0, 1.0, now()),
  ('price_down_5m_at_exit', 'rug', 'price down 5m at exit', 1, 0, 0.0, now()),
  ('price_down_20pct_5m_at_exit', 'rug', 'price down 20pct 5m at exit', 1, 0, 0.0, now()),
  ('entry_score_below_67', 'rug', 'entry score below 67', 16, 0, 1.0, now()),
  ('top3_holders_above_30pct', 'rug', 'top3 holders above 30pct', 1, 0, 0.0, now()),
  ('top3_holders_above_40pct', 'rug', 'top3 holders above 40pct', 1, 0, 0.0, now())
on conflict (id, kind) do update set
  positive_count = excluded.positive_count,
  negative_count = excluded.negative_count,
  weight = excluded.weight,
  last_seen = excluded.last_seen;

insert into learned_patterns (id, kind, description, positive_count, negative_count, weight, last_seen) values
  ('top3_holders_below_15pct', 'moon', 'top3 holders below 15pct', 61, 98, 0.383648, now()),
  ('entry_score_above_70', 'moon', 'entry score above 70', 31, 29, 0.516667, now()),
  ('venue_pumpswap', 'moon', 'venue pumpswap', 100, 135, 0.425532, now()),
  ('status_graduated', 'moon', 'status graduated', 100, 135, 0.425532, now()),
  ('entry_score_above_75', 'moon', 'entry score above 75', 31, 60, 0.340659, now()),
  ('entry_price_e7_range', 'moon', 'entry price e7 range', 84, 116, 0.42, now()),
  ('single_holder_below_5pct', 'moon', 'single holder below 5pct', 60, 0, 1.0, now()),
  ('single_holder_below_10pct', 'moon', 'single holder below 10pct', 61, 0, 1.0, now()),
  ('liquidity_above_50sol', 'moon', 'liquidity above 50sol', 100, 0, 1.0, now()),
  ('price_up_50pct_5m', 'moon', 'price up 50pct 5m', 30, 0, 1.0, now()),
  ('volume_5m_above_10k', 'moon', 'volume 5m above 10k', 91, 0, 1.0, now()),
  ('holder_count_above_100', 'moon', 'holder count above 100', 11, 0, 1.0, now()),
  ('roi_above_50pct', 'moon', 'roi above 50pct', 51, 0, 1.0, now()),
  ('top3_holders_below_25pct', 'moon', 'top3 holders below 25pct', 8, 6, 0.571429, now()),
  ('holder_count_above_500', 'moon', 'holder count above 500', 40, 0, 1.0, now()),
  ('held_over_15min', 'moon', 'held over 15min', 60, 0, 1.0, now()),
  ('held_over_10min', 'moon', 'held over 10min', 64, 0, 1.0, now()),
  ('roi_above_100pct', 'moon', 'roi above 100pct', 20, 0, 1.0, now()),
  ('top3_holders_below_20pct', 'moon', 'top3 holders below 20pct', 0, 3, 0.0, now()),
  ('holder_count_above_200', 'moon', 'holder count above 200', 21, 0, 1.0, now()),
  ('price_up_10pct_5m', 'moon', 'price up 10pct 5m', 7, 0, 1.0, now()),
  ('entry_price_e6_range', 'moon', 'entry price e6 range', 6, 5, 0.545455, now()),
  ('price_up_20pct_5m', 'moon', 'price up 20pct 5m', 12, 0, 1.0, now()),
  ('roi_above_200pct', 'moon', 'roi above 200pct', 6, 0, 1.0, now()),
  ('volume_5m_above_5k', 'moon', 'volume 5m above 5k', 7, 0, 1.0, now())
on conflict (id, kind) do update set
  positive_count = excluded.positive_count,
  negative_count = excluded.negative_count,
  weight = excluded.weight,
  last_seen = excluded.last_seen;
