-- ============================================================
-- 东湖旅游导览系统 · Supabase 种子数据（自动生成，勿手工编辑）
-- 来源：blender_model/tingtao_network.json（示意数据，不可用于实地导航）
-- 生成：node tools/gen_seed.mjs
-- ============================================================

insert into public.nodes
  (node_id, name, type, lat, lng, x_m, y_m, desc, duration_min, cover_img, sort_order, coordinate_status)
values
  ('entry', '梨园广场入口', 'entry', 30.571248, 114.360792, -403.32160077761426, 389.4480904747758, '听涛景区西侧主入口，紧邻梨园广场与绿道起点。进园后沿主步道向东，即可依次到达行吟阁、碧潭观鱼等景点。', 0, './public/covers/entry.svg', 1, 'schematic_not_measured'),
  ('A', '绿道分岔口', 'junction', 30.569951, 114.362287, -260, 245, '主步道与滨湖支路的分岔口：向北通往行吟阁，向西南通往碧潭观鱼，是进园后的第一个方向决策点。', 0, './public/covers/A.svg', 2, 'schematic_not_measured'),
  ('p1', '行吟阁', 'poi', 30.569681, 114.366043, 100, 215, '纪念屈原的仿古楼阁，三层重檐，登阁可俯瞰东湖水面，是听涛景区的标志性建筑。', 30, './public/covers/p1.svg', 3, 'schematic_not_measured'),
  ('p2', '碧潭观鱼', 'poi', 30.568828, 114.364009, -95, 120, '临水观鱼景点，池水清澈、锦鲤成群，设亲水平台与休憩廊架，适合停留拍照。', 20, './public/covers/p2.svg', 4, 'schematic_not_measured'),
  ('p3', '长天楼', 'poi', 30.566627, 114.366669, 160, -125, '湖岸观景楼阁，视野开阔，是观赏湖面全景与日出日落的好位置。', 20, './public/covers/p3.svg', 5, 'schematic_not_measured'),
  ('p4', '落霞水榭', 'poi', 30.567975, 114.366826, 175, 25, '临湖木质水榭，三面临水，傍晚落霞倒映水面，是听涛景区的经典拍摄点。', 15, './public/covers/p4.svg', 6, 'schematic_not_measured'),
  ('p5', '苍柏园', 'poi', 30.565235, 114.364583, -40, -280, '以苍翠柏木成景的林下园区，步道平缓、树荫充足，适合慢行休憩与避暑。', 20, './public/covers/p5.svg', 7, 'schematic_not_measured'),
  ('B', '听涛路交汇口', 'junction', 30.566897, 114.363748, -120, -95, '听涛路与湖边步道的交汇口：向东往长天楼方向，向东南可继续前往湖岸岔路口。', 0, './public/covers/B.svg', 8, 'schematic_not_measured'),
  ('C', '湖岸岔路口', 'junction', 30.565459, 114.367921, 280, -255, '湖岸线与园区道路的岔路口，向南通往听涛东大门，是离园前的最后一个节点。', 0, './public/covers/C.svg', 9, 'schematic_not_measured'),
  ('exit', '听涛东大门', 'entry', 30.564252, 114.369208, 403.32160077761426, -389.4480904747758, '听涛景区东侧出口，紧邻湖岸道路，可由此外出离园，也可作为反向游览的起点。', 0, './public/covers/exit.svg', 10, 'schematic_not_measured')
on conflict (node_id) do update set
  name = excluded.name,
  type = excluded.type,
  lat = excluded.lat,
  lng = excluded.lng,
  x_m = excluded.x_m,
  y_m = excluded.y_m,
  desc = excluded.desc,
  duration_min = excluded.duration_min,
  cover_img = excluded.cover_img,
  sort_order = excluded.sort_order,
  coordinate_status = excluded.coordinate_status;

insert into public.edges
  (id, from_node, to_node, length_m, width_m, polyline, surveyed)
values
  ('road_01_entry_A', 'entry', 'A', 300, 3, '[[-403.32160077761426,389.4480904747758],[-340,330],[-260,245]]'::jsonb, false),
  ('road_02_A_p1', 'A', 'p1', 550, 3, '[[-260,245],[-150,295],[0,275],[100,215]]'::jsonb, false),
  ('road_03_A_p2', 'A', 'p2', 400, 2, '[[-260,245],[-220,170],[-155,165],[-95,120]]'::jsonb, false),
  ('road_04_p1_p2', 'p1', 'p2', 200, 2, '[[100,215],[40,150],[-95,120]]'::jsonb, false),
  ('road_05_p1_p3', 'p1', 'p3', 600, 3, '[[100,215],[140,130],[120,55],[120,-35],[160,-125]]'::jsonb, false),
  ('road_06_p2_p4', 'p2', 'p4', 350, 3, '[[-95,120],[-35,60],[65,65],[175,25]]'::jsonb, false),
  ('road_07_p4_B', 'p4', 'B', 300, 3, '[[175,25],[80,-15],[-25,-45],[-120,-95]]'::jsonb, false),
  ('road_08_B_p3', 'B', 'p3', 450, 3, '[[-120,-95],[-60,-170],[55,-185],[160,-125]]'::jsonb, false),
  ('road_09_p3_p5', 'p3', 'p5', 350, 2, '[[160,-125],[100,-230],[40,-250],[-40,-280]]'::jsonb, false),
  ('road_10_p5_exit', 'p5', 'exit', 400, 3, '[[-40,-280],[80,-330],[230,-345],[403.32160077761426,-389.4480904747758]]'::jsonb, false),
  ('road_11_p3_C', 'p3', 'C', 250, 3, '[[160,-125],[240,-170],[280,-255]]'::jsonb, false),
  ('road_12_C_exit', 'C', 'exit', 300, 3, '[[280,-255],[320,-325],[403.32160077761426,-389.4480904747758]]'::jsonb, false)
on conflict (id) do update set
  from_node = excluded.from_node,
  to_node = excluded.to_node,
  length_m = excluded.length_m,
  width_m = excluded.width_m,
  polyline = excluded.polyline,
  surveyed = excluded.surveyed;
