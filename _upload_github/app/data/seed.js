/**
 * 本文件由 tools/gen_seed.mjs 自动生成，请勿手工编辑。
 * 数据来源：blender_model/tingtao_network.json（示意数据，示意图，不可用于实地导航）
 * 重新生成： node tools/gen_seed.mjs
 */
export const MAP_META = {
  "source": "blender_model/tingtao_network.json",
  "status": "SCHEMATIC_NOT_FOR_NAVIGATION",
  "status_label": "示意图，不可用于实地导航",
  "scale": 500,
  "extent_m": [
    862.6432015552285,
    834.8961809495516
  ],
  "bbox_wgs84": [
    114.3605,
    30.564,
    114.3695,
    30.5715
  ],
  "model_height_m": 0.006,
  "generator": "tools/gen_seed.mjs",
  "generated_at": "2026-10-13T02:00:38.102Z"
};

export const NODES = [
  {
    "node_id": "entry",
    "name": "梨园广场入口",
    "type": "entry",
    "kind_label": "入口",
    "lat": 30.571248,
    "lng": 114.360792,
    "x_m": -403.32160077761426,
    "y_m": 389.4480904747758,
    "desc": "听涛景区西侧主入口，紧邻梨园广场与绿道起点。进园后沿主步道向东，即可依次到达行吟阁、碧潭观鱼等景点。",
    "duration_min": 0,
    "cover_img": "./public/covers/entry.svg",
    "sort_order": 1,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "A",
    "name": "绿道分岔口",
    "type": "junction",
    "kind_label": "路口",
    "lat": 30.569951,
    "lng": 114.362287,
    "x_m": -260,
    "y_m": 245,
    "desc": "主步道与滨湖支路的分岔口：向北通往行吟阁，向西南通往碧潭观鱼，是进园后的第一个方向决策点。",
    "duration_min": 0,
    "cover_img": "./public/covers/A.svg",
    "sort_order": 2,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "p1",
    "name": "行吟阁",
    "type": "poi",
    "kind_label": "景点",
    "lat": 30.569681,
    "lng": 114.366043,
    "x_m": 100,
    "y_m": 215,
    "desc": "纪念屈原的仿古楼阁，三层重檐，登阁可俯瞰东湖水面，是听涛景区的标志性建筑。",
    "duration_min": 30,
    "cover_img": "./public/covers/p1.svg",
    "sort_order": 3,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "p2",
    "name": "碧潭观鱼",
    "type": "poi",
    "kind_label": "景点",
    "lat": 30.568828,
    "lng": 114.364009,
    "x_m": -95,
    "y_m": 120,
    "desc": "临水观鱼景点，池水清澈、锦鲤成群，设亲水平台与休憩廊架，适合停留拍照。",
    "duration_min": 20,
    "cover_img": "./public/covers/p2.svg",
    "sort_order": 4,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "p3",
    "name": "长天楼",
    "type": "poi",
    "kind_label": "景点",
    "lat": 30.566627,
    "lng": 114.366669,
    "x_m": 160,
    "y_m": -125,
    "desc": "湖岸观景楼阁，视野开阔，是观赏湖面全景与日出日落的好位置。",
    "duration_min": 20,
    "cover_img": "./public/covers/p3.svg",
    "sort_order": 5,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "p4",
    "name": "落霞水榭",
    "type": "poi",
    "kind_label": "景点",
    "lat": 30.567975,
    "lng": 114.366826,
    "x_m": 175,
    "y_m": 25,
    "desc": "临湖木质水榭，三面临水，傍晚落霞倒映水面，是听涛景区的经典拍摄点。",
    "duration_min": 15,
    "cover_img": "./public/covers/p4.svg",
    "sort_order": 6,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "p5",
    "name": "苍柏园",
    "type": "poi",
    "kind_label": "景点",
    "lat": 30.565235,
    "lng": 114.364583,
    "x_m": -40,
    "y_m": -280,
    "desc": "以苍翠柏木成景的林下园区，步道平缓、树荫充足，适合慢行休憩与避暑。",
    "duration_min": 20,
    "cover_img": "./public/covers/p5.svg",
    "sort_order": 7,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "B",
    "name": "听涛路交汇口",
    "type": "junction",
    "kind_label": "路口",
    "lat": 30.566897,
    "lng": 114.363748,
    "x_m": -120,
    "y_m": -95,
    "desc": "听涛路与湖边步道的交汇口：向东往长天楼方向，向东南可继续前往湖岸岔路口。",
    "duration_min": 0,
    "cover_img": "./public/covers/B.svg",
    "sort_order": 8,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "C",
    "name": "湖岸岔路口",
    "type": "junction",
    "kind_label": "路口",
    "lat": 30.565459,
    "lng": 114.367921,
    "x_m": 280,
    "y_m": -255,
    "desc": "湖岸线与园区道路的岔路口，向南通往听涛东大门，是离园前的最后一个节点。",
    "duration_min": 0,
    "cover_img": "./public/covers/C.svg",
    "sort_order": 9,
    "coordinate_status": "schematic_not_measured"
  },
  {
    "node_id": "exit",
    "name": "听涛东大门",
    "type": "entry",
    "kind_label": "入口",
    "lat": 30.564252,
    "lng": 114.369208,
    "x_m": 403.32160077761426,
    "y_m": -389.4480904747758,
    "desc": "听涛景区东侧出口，紧邻湖岸道路，可由此外出离园，也可作为反向游览的起点。",
    "duration_min": 0,
    "cover_img": "./public/covers/exit.svg",
    "sort_order": 10,
    "coordinate_status": "schematic_not_measured"
  }
];

export const ROADS = [
  {
    "id": "road_01_entry_A",
    "edge_id": "road_01_entry_A",
    "from_node": "entry",
    "to_node": "A",
    "from_name": "梨园广场入口",
    "to_name": "绿道分岔口",
    "length_m": 300,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        -403.32160077761426,
        389.4480904747758
      ],
      [
        -340,
        330
      ],
      [
        -260,
        245
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_02_A_p1",
    "edge_id": "road_02_A_p1",
    "from_node": "A",
    "to_node": "p1",
    "from_name": "绿道分岔口",
    "to_name": "行吟阁",
    "length_m": 550,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        -260,
        245
      ],
      [
        -150,
        295
      ],
      [
        0,
        275
      ],
      [
        100,
        215
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_03_A_p2",
    "edge_id": "road_03_A_p2",
    "from_node": "A",
    "to_node": "p2",
    "from_name": "绿道分岔口",
    "to_name": "碧潭观鱼",
    "length_m": 400,
    "width_m": 2,
    "course": "支路",
    "polyline": [
      [
        -260,
        245
      ],
      [
        -220,
        170
      ],
      [
        -155,
        165
      ],
      [
        -95,
        120
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_04_p1_p2",
    "edge_id": "road_04_p1_p2",
    "from_node": "p1",
    "to_node": "p2",
    "from_name": "行吟阁",
    "to_name": "碧潭观鱼",
    "length_m": 200,
    "width_m": 2,
    "course": "支路",
    "polyline": [
      [
        100,
        215
      ],
      [
        40,
        150
      ],
      [
        -95,
        120
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_05_p1_p3",
    "edge_id": "road_05_p1_p3",
    "from_node": "p1",
    "to_node": "p3",
    "from_name": "行吟阁",
    "to_name": "长天楼",
    "length_m": 600,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        100,
        215
      ],
      [
        140,
        130
      ],
      [
        120,
        55
      ],
      [
        120,
        -35
      ],
      [
        160,
        -125
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_06_p2_p4",
    "edge_id": "road_06_p2_p4",
    "from_node": "p2",
    "to_node": "p4",
    "from_name": "碧潭观鱼",
    "to_name": "落霞水榭",
    "length_m": 350,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        -95,
        120
      ],
      [
        -35,
        60
      ],
      [
        65,
        65
      ],
      [
        175,
        25
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_07_p4_B",
    "edge_id": "road_07_p4_B",
    "from_node": "p4",
    "to_node": "B",
    "from_name": "落霞水榭",
    "to_name": "听涛路交汇口",
    "length_m": 300,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        175,
        25
      ],
      [
        80,
        -15
      ],
      [
        -25,
        -45
      ],
      [
        -120,
        -95
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_08_B_p3",
    "edge_id": "road_08_B_p3",
    "from_node": "B",
    "to_node": "p3",
    "from_name": "听涛路交汇口",
    "to_name": "长天楼",
    "length_m": 450,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        -120,
        -95
      ],
      [
        -60,
        -170
      ],
      [
        55,
        -185
      ],
      [
        160,
        -125
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_09_p3_p5",
    "edge_id": "road_09_p3_p5",
    "from_node": "p3",
    "to_node": "p5",
    "from_name": "长天楼",
    "to_name": "苍柏园",
    "length_m": 350,
    "width_m": 2,
    "course": "支路",
    "polyline": [
      [
        160,
        -125
      ],
      [
        100,
        -230
      ],
      [
        40,
        -250
      ],
      [
        -40,
        -280
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_10_p5_exit",
    "edge_id": "road_10_p5_exit",
    "from_node": "p5",
    "to_node": "exit",
    "from_name": "苍柏园",
    "to_name": "听涛东大门",
    "length_m": 400,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        -40,
        -280
      ],
      [
        80,
        -330
      ],
      [
        230,
        -345
      ],
      [
        403.32160077761426,
        -389.4480904747758
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_11_p3_C",
    "edge_id": "road_11_p3_C",
    "from_node": "p3",
    "to_node": "C",
    "from_name": "长天楼",
    "to_name": "湖岸岔路口",
    "length_m": 250,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        160,
        -125
      ],
      [
        240,
        -170
      ],
      [
        280,
        -255
      ]
    ],
    "surveyed": false
  },
  {
    "id": "road_12_C_exit",
    "edge_id": "road_12_C_exit",
    "from_node": "C",
    "to_node": "exit",
    "from_name": "湖岸岔路口",
    "to_name": "听涛东大门",
    "length_m": 300,
    "width_m": 3,
    "course": "主步道",
    "polyline": [
      [
        280,
        -255
      ],
      [
        320,
        -325
      ],
      [
        403.32160077761426,
        -389.4480904747758
      ]
    ],
    "surveyed": false
  }
];
