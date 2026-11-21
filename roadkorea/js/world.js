// ===================== 월드 (실제 광주 지도) =====================
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, mulberry, pick, canvasTex, roundRect, GEO, mx, Merger, boxUV, TAU, MinHeap } from './util.js';
import { ROUTES, ROUTE_COLORS, CARS, BUS_TYPES, STOP_SUFFIX, dongAt, guAt } from './data.js';
import { buildCar } from './models.js';
// 큰 지도 자료는 타이틀이 뜬 다음 따로 받음 (처음 화면이 바로 나오게)
let GJ = null, GH = null, GD = null, GP = null, GB = null, GG = null, GI = null, stopDB = null;
// 다른 도시 (가까이 가면 그때 지도 자료를 받아 붙임) — 지명: [이름, 위도, 경도, 반경 m]
export const REGION_DEFS = [
  {
    id: 'seoul', name: '서울', mod: './rg_seoul.js', extra: './rp_seoul.js',
    // 실제 노선 (정류장 순서는 지도를 받을 때 함께 받음)
    real: [['trunk', '340', '강동 ↔ 천호역 ↔ 석촌역 ↔ 대치동 ↔ 한티역 ↔ 강남역'], ['trunk', '402', '장지 ↔ 수서역 ↔ 개포동 ↔ 양재역 ↔ 강남역 ↔ 한남대교 ↔ 남산 ↔ 시청'], ['branch', '3411', '강동 ↔ 천호역 ↔ 잠실역 ↔ 한티역 ↔ 삼성역 ↔ 종합운동장']], bbox: [126.885, 127.160, 37.455, 37.580],
    tower: { lat: 37.5126, lon: 127.1025 },
    places: [
      ['잠실역', 37.5133, 127.1001, 160], ['롯데월드타워', 37.5126, 127.1025, 140], ['롯데월드', 37.5111, 127.0981, 150], ['석촌호수', 37.5096, 127.1035, 220],
      ['잠실종합운동장', 37.5152, 127.0727, 300], ['잠실한강공원', 37.5179, 127.0826, 250], ['송파구청', 37.5145, 127.1059, 100], ['서울아산병원', 37.5266, 127.1078, 160],
      ['올림픽공원', 37.5207, 127.1213, 400], ['삼성역 · 코엑스', 37.5089, 127.0631, 220], ['선릉역', 37.5045, 127.0490, 140], ['강남역', 37.4979, 127.0276, 160],
      ['양재역', 37.4846, 127.0347, 140], ['양재IC', 37.4699, 127.0396, 200], ['수서역', 37.4875, 127.1012, 160], ['가락시장', 37.4925, 127.1105, 250],
      ['문정역', 37.4859, 127.1224, 140], ['석촌역', 37.5055, 127.1069, 120], ['잠실새내역', 37.5116, 127.0863, 120], ['종합운동장역', 37.5110, 127.0736, 120],
      ['서울역', 37.5547, 126.9707, 200], ['서울시청', 37.5663, 126.9779, 150], ['광화문', 37.5759, 126.9768, 200], ['동대문디자인플라자', 37.5665, 127.0092, 200],
      ['왕십리역', 37.5612, 127.0371, 150], ['서울숲', 37.5444, 127.0374, 300], ['성수역', 37.5446, 127.0560, 120], ['건대입구역', 37.5404, 127.0702, 150],
      ['천호역', 37.5386, 127.1236, 150], ['고속터미널', 37.5049, 127.0049, 200], ['서초역', 37.4918, 127.0076, 120], ['이태원', 37.5345, 126.9946, 200],
      ['한남대교', 37.5260, 127.0130, 300], ['반포한강공원', 37.5106, 126.9958, 300], ['압구정역', 37.5270, 127.0284, 150], ['청담대교', 37.5254, 127.0612, 300],
      ['여의도역', 37.5216, 126.9243, 150], ['국회의사당', 37.5317, 126.9142, 250], ['63빌딩', 37.5198, 126.9403, 150], ['여의도한강공원', 37.5284, 126.9328, 300],
      ['더현대 서울', 37.5259, 126.9284, 150], ['여의도공원', 37.5256, 126.9222, 250], ['영등포역', 37.5155, 126.9076, 160], ['타임스퀘어', 37.5172, 126.9035, 150],
      ['홍대입구역', 37.5571, 126.9245, 160], ['합정역', 37.5495, 126.9139, 140], ['신촌역', 37.5552, 126.9369, 140], ['연세대학교', 37.5658, 126.9386, 250],
      ['이화여대', 37.5618, 126.9469, 200], ['공덕역', 37.5443, 126.9516, 140], ['마포대교', 37.5340, 126.9358, 300], ['당산역', 37.5345, 126.9026, 140],
      ['노량진수산시장', 37.5137, 126.9407, 200], ['서대문 독립공원', 37.5744, 126.9580, 200], ['효창공원', 37.5446, 126.9616, 200], ['용산역', 37.5298, 126.9648, 180],
    ],
    spawns: {
      sl_jamsil: [37.5133, 127.0985, 37.5133, 127.1030, '잠실역 사거리 · 롯데월드타워 앞', 1],
      sl_lake: [37.5050, 127.1070, 37.5000, 127.1120, '석촌호수 · 송파대로', 1, '송파대로'],
      sl_sports: [37.5130, 127.0760, 37.5130, 127.0840, '잠실종합운동장 · 올림픽로', 1],
      sl_coex: [37.5070, 127.0570, 37.5090, 127.0640, '삼성역 · 코엑스 (테헤란로)', 1, '테헤란로'],
      sl_gangnam: [37.4985, 127.0300, 37.5010, 127.0380, '강남역 · 테헤란로', 1, '테헤란로'],
      sl_yangjae: [37.4800, 127.0345, 37.4900, 127.0345, '양재역 · 강남대로', 1, '강남대로'],
      sl_gwanghwamun: [37.5700, 126.9769, 37.5760, 126.9769, '광화문 · 세종대로', 1, '세종대로'],
      sl_seoulst: [37.5530, 126.9725, 37.5600, 126.9750, '서울역 · 숭례문', 1],
      sl_seongsu: [37.5446, 127.0500, 37.5446, 127.0600, '성수역 · 아차산로', 1, '아차산로'],
      sl_konkuk: [37.5404, 127.0650, 37.5404, 127.0750, '건대입구 · 능동로', 1],
      sl_banpo: [37.5049, 127.0000, 37.5100, 127.0050, '고속터미널 · 반포대로', 1],
      sl_hannam: [37.5130, 127.0205, 37.5200, 127.0185, '신사역 · 강남대로 (한남대교 방향)', 1, '강남대로'],
      sl_yeouido: [37.5216, 126.9270, 37.5260, 126.9290, '여의도 · 여의대로 (더현대 서울 방향)', 1, '여의대로'],
      sl_hongdae: [37.5571, 126.9270, 37.5560, 126.9330, '홍대입구 · 양화로 (신촌 방향)', 1, '양화로'],
      sl_sinchon: [37.5552, 126.9400, 37.5580, 126.9450, '신촌 · 신촌로 (이대 방향)', 1, '신촌로'],
      sl_yeongdeungpo: [37.5172, 126.9060, 37.5200, 126.9100, '영등포 · 타임스퀘어 앞', 1],
      sl_mapo: [37.5400, 126.9460, 37.5440, 126.9510, '마포대로 · 공덕역 방향', 1, '마포대로'],
    },
    // 서울 시내버스 (실제 큰길을 따라가는 게임 노선 — 번호 · 경로는 실제 노선과 다름)
    routes: [
      ['trunk', 'S1', '서울 간선 S1', '잠실역 ↔ 삼성역 ↔ 선릉역 ↔ 강남역 ↔ 고속터미널 (테헤란로)', 's_hg', [[37.5133, 127.1001], [37.5110, 127.0736], [37.5089, 127.0631], [37.5045, 127.0490], [37.4979, 127.0276], [37.5049, 127.0049]]],
      ['trunk', 'S2', '서울 간선 S2', '천호역 ↔ 잠실역 ↔ 석촌역 ↔ 가락시장 ↔ 수서역 (송파대로)', 's_hg', [[37.5386, 127.1236], [37.5133, 127.1001], [37.5055, 127.1069], [37.4925, 127.1105], [37.4875, 127.1012]]],
      ['trunk', 'S3', '서울 간선 S3', '서울역 ↔ 시청 ↔ 광화문 ↔ 동대문 ↔ 왕십리 ↔ 성수 ↔ 건대입구', 's_hg', [[37.5547, 126.9707], [37.5663, 126.9779], [37.5759, 126.9768], [37.5711, 127.0095], [37.5612, 127.0371], [37.5446, 127.0560], [37.5404, 127.0702]]],
      ['branch', 'S4', '서울 지선 S4', '잠실새내 ↔ 삼성역 ↔ 압구정 ↔ 한남대교 ↔ 이태원', 's_hg', [[37.5116, 127.0863], [37.5089, 127.0631], [37.5270, 127.0284], [37.5260, 127.0130], [37.5345, 126.9946]]],
      ['express', 'S5', '서울 급행 S5', '양재역 ↔ 강남역 ↔ 한남대교 ↔ 서울역', 's_hg', [[37.4846, 127.0347], [37.4979, 127.0276], [37.5260, 127.0130], [37.5547, 126.9707]]],
      ['trunk', 'S6', '서울 간선 S6', '여의도역 ↔ 마포대교 ↔ 공덕역 ↔ 이대 ↔ 신촌역 ↔ 홍대입구역 ↔ 합정역', 's_hg', [[37.5216, 126.9243], [37.5340, 126.9358], [37.5443, 126.9516], [37.5568, 126.9460], [37.5552, 126.9369], [37.5571, 126.9245], [37.5495, 126.9139]]],
      ['branch', 'S7', '서울 지선 S7', '영등포역 ↔ 당산역 ↔ 양화대교 ↔ 합정역 ↔ 망원 ↔ 홍대입구', 's_hg', [[37.5155, 126.9076], [37.5345, 126.9026], [37.5495, 126.9139], [37.5560, 126.9100], [37.5571, 126.9245]]],
      ['express', 'S8', '서울 급행 S8', '여의도 ↔ 마포 ↔ 공덕 ↔ 충정로 ↔ 서울역 ↔ 광화문', 's_hg', [[37.5216, 126.9243], [37.5395, 126.9460], [37.5443, 126.9516], [37.5600, 126.9637], [37.5547, 126.9707], [37.5759, 126.9768]]],
    ],
  },
  {
    id: 'daejeon', name: '대전', mod: './rg_daejeon.js', extra: './rp_daejeon.js',
    real: [['trunk', '317', '대전역 ↔ 오룡역 ↔ 충남대병원 ↔ 중구청 ↔ 으능정이 ↔ 대전역'], ['trunk', '특구1', 'KAIST ↔ 연구단지 ↔ 신세계백화점 ↔ 엑스포 ↔ 유성온천 ↔ 충남대'], ['express', '급행3', '도안 ↔ 갈마 ↔ 둔산 ↔ 신세계백화점 ↔ 갤러리아타임월드']], bbox: [127.33, 127.475, 36.295, 36.405],
    places: [
      ['대전역', 36.3324, 127.4348, 200], ['대전시청', 36.3504, 127.3848, 150], ['정부대전청사', 36.3592, 127.3849, 200], ['엑스포과학공원', 36.3755, 127.3876, 300],
      ['한밭수목원', 36.3687, 127.3887, 300], ['으능정이 문화의거리', 36.3283, 127.4275, 150], ['유성온천역', 36.3536, 127.3415, 150], ['충남대학교', 36.3664, 127.3445, 300],
      ['KAIST', 36.3721, 127.3604, 300], ['대전복합터미널', 36.3502, 127.4374, 150], ['대전IC', 36.3639, 127.4508, 200], ['갑천', 36.3600, 127.3950, 300],
    ],
    spawns: {
      dj_station: [36.3300, 127.4290, 36.3320, 127.4340, '대전역 · 중앙로', 1, '중앙로'],
      dj_dunsan: [36.3504, 127.3900, 36.3504, 127.3800, '둔산 · 대전시청 앞', 1],
      dj_expo: [36.3720, 127.3900, 36.3780, 127.3880, '엑스포과학공원 · 대덕대로', 1],
      dj_yuseong: [36.3536, 127.3450, 36.3536, 127.3380, '유성온천 · 계룡로', 1],
      dj_ic: [36.3600, 127.4450, 36.3500, 127.4380, '대전IC 근처 · 용전동', 1],
    },
    routes: [
      ['trunk', 'D1', '대전 간선 D1', '대전역 ↔ 으능정이 ↔ 대전시청 ↔ 정부대전청사 ↔ 엑스포과학공원', 'd_hb', [[36.3324, 127.4348], [36.3283, 127.4275], [36.3504, 127.3848], [36.3592, 127.3849], [36.3755, 127.3876]]],
      ['express', 'D2', '대전 급행 D2', '대전복합터미널 ↔ 대전역 ↔ 대전시청 ↔ 유성온천', 'd_hb', [[36.3502, 127.4374], [36.3324, 127.4348], [36.3504, 127.3848], [36.3536, 127.3415]]],
      ['branch', 'D3', '대전 지선 D3', '유성온천 ↔ 충남대 ↔ KAIST ↔ 한밭수목원', 'd_hb', [[36.3536, 127.3415], [36.3664, 127.3445], [36.3721, 127.3604], [36.3687, 127.3887]]],
    ],
  },
  {
    id: 'busan', name: '부산', mod: './rg_busan.js', extra: './rp_busan.js',
    real: [['trunk', '1003', '해운대 ↔ 광안 ↔ 경성대 ↔ 부산진역 ↔ 부산역 ↔ 남포동 ↔ 토성 (급행 간선)'], ['trunk', '10', '사직 ↔ 교대 ↔ 양정 ↔ 서면 ↔ 문현 ↔ 대연 ↔ 감만'], ['express', '1001', '해운대 ↔ 센텀시티 ↔ 광안 ↔ 문현 ↔ 부산역 ↔ 대티']], bbox: [128.96, 129.17, 35.09, 35.21],
    places: [
      ['부산역', 35.1151, 129.0422, 200], ['서면', 35.1578, 129.0600, 250], ['남포동 · BIFF광장', 35.0985, 129.0280, 150], ['자갈치시장', 35.0966, 129.0306, 150], ['국제시장', 35.1010, 129.0280, 150],
      ['용두산공원 · 부산타워', 35.1009, 129.0325, 200], ['광안리해수욕장', 35.1532, 129.1186, 300], ['광안대교', 35.1475, 129.1300, 400], ['해운대해수욕장', 35.1587, 129.1604, 350],
      ['센텀시티 · 신세계백화점', 35.1690, 129.1296, 200], ['벡스코', 35.1690, 129.1360, 200], ['부산광역시청', 35.1797, 129.0750, 150], ['사직야구장', 35.1940, 129.0615, 250],
      ['경성대 · 부경대', 35.1375, 129.1010, 250], ['부산진역', 35.1286, 129.0480, 150], ['부산서부시외버스터미널 (사상)', 35.1645, 128.9810, 150], ['동백섬 · 누리마루', 35.1530, 129.1520, 200],
    ],
    spawns: {
      bs_station: [35.1140, 129.0405, 35.1200, 129.0440, '부산역 · 중앙대로', 1, '중앙대로'],
      bs_seomyeon: [35.1540, 129.0585, 35.1610, 129.0610, '서면 · 중앙대로', 1, '중앙대로'],
      bs_nampo: [35.0985, 129.0290, 35.0995, 129.0350, '남포동 · 자갈치 (구덕로)', 1],
      bs_gwangan: [35.1580, 129.1140, 35.1520, 129.1170, '광안리 · 광안해변로', 1],
      bs_haeundae: [35.1630, 129.1560, 35.1630, 129.1640, '해운대 · 해운대해수욕장 앞', 1],
      bs_centum: [35.1690, 129.1250, 35.1690, 129.1320, '센텀시티 · 벡스코', 1],
      bs_sasang: [35.1560, 128.9900, 35.1620, 128.9900, '사상 · 남해고속도로 끝 (서부산)', 1],
    },
    routes: [
      ['trunk', 'B1', '부산 간선 B1', '사상역 ↔ 냉정 ↔ 개금 ↔ 가야 ↔ 서면 (가야대로)', 'b_db', [[35.1624, 128.9849], [35.1515, 129.0123], [35.1530, 129.0215], [35.1549, 129.0380], [35.1578, 129.0594]]],
      ['express', 'B2', '부산 급행 B2', '서면 ↔ 문현 ↔ 경성대 ↔ 광안리 ↔ 센텀시티 ↔ 해운대', 'b_db', [[35.1578, 129.0594], [35.1375, 129.0660], [35.1375, 129.1010], [35.1550, 129.1130], [35.1690, 129.1296], [35.1630, 129.1590]]],
    ],
  },
  {
    id: 'daegu', name: '대구', mod: './rg_daegu.js', extra: './rp_daegu.js', bbox: [128.50, 128.65, 35.83, 35.905],
    places: [
      ['동성로', 35.8690, 128.5960, 200], ['반월당', 35.8655, 128.5930, 150], ['대구역', 35.8790, 128.5960, 200], ['동대구역', 35.8794, 128.6286, 250],
      ['서문시장', 35.8690, 128.5800, 200], ['대구시청', 35.8714, 128.6014, 150], ['83타워 · 이월드', 35.8533, 128.5665, 300], ['두류공원', 35.8500, 128.5600, 300],
      ['김광석길', 35.8600, 128.6070, 150], ['수성못', 35.8285, 128.6170, 300], ['경북대학교', 35.8890, 128.6110, 300], ['범어네거리', 35.8590, 128.6250, 150],
    ],
    spawns: {
      dg_dongseong: [35.8655, 128.5900, 35.8655, 128.5990, '반월당 · 달구벌대로', 1, '달구벌대로'],
      dg_station: [35.8780, 128.5900, 35.8780, 128.6000, '대구역 · 태평로', 1],
      dg_dongdaegu: [35.8770, 128.6250, 35.8820, 128.6290, '동대구역 · 동대구로', 1, '동대구로'],
      dg_beomeo: [35.8590, 128.6200, 35.8590, 128.6300, '범어네거리 · 달구벌대로', 1, '달구벌대로'],
      dg_duryu: [35.8530, 128.5600, 35.8560, 128.5700, '두류공원 · 83타워', 1],
      dg_seongseo: [35.8360, 128.5300, 35.8420, 128.5300, '성서 · 고속도로 끝', 1],
    },
    routes: [
      ['trunk', 'G1', '대구 간선 G1', '두류공원 ↔ 반월당 ↔ 동성로 ↔ 범어네거리 ↔ 수성구청 (달구벌대로)', 'g_dg', [[35.8530, 128.5650], [35.8655, 128.5930], [35.8640, 128.6080], [35.8590, 128.6250], [35.8580, 128.6310]]],
      ['express', 'G2', '대구 급행 G2', '대구역 ↔ 중앙로 ↔ 반월당 ↔ 수성못', 'g_dg', [[35.8790, 128.5960], [35.8700, 128.5940], [35.8655, 128.5930], [35.8285, 128.6170]]],
      ['branch', 'G3', '대구 지선 G3', '서문시장 ↔ 대구역 ↔ 경북대 ↔ 동대구역', 'g_dg', [[35.8690, 128.5800], [35.8790, 128.5960], [35.8890, 128.6110], [35.8794, 128.6286]]],
    ],
  },
  {
    id: 'incheon', name: '인천', mod: './rg_incheon.js', extra: './rp_incheon.js', bbox: [126.60, 126.75, 37.37, 37.52],
    places: [
      ['인천광역시청', 37.4563, 126.7052, 150], ['부평역 · 부평 지하상가', 37.4895, 126.7245, 200], ['구월동 로데오거리', 37.4480, 126.7020, 150], ['주안역', 37.4650, 126.6800, 150],
      ['인천역 · 차이나타운', 37.4760, 126.6170, 200], ['동인천역 · 신포시장', 37.4752, 126.6325, 150], ['월미공원', 37.4790, 126.6040, 250], ['인천문학경기장 · 인천SSG랜더스필드', 37.4370, 126.6930, 300],
      ['송도 센트럴파크', 37.3925, 126.6390, 300], ['인하대학교', 37.4505, 126.6560, 250], ['인천종합터미널', 37.4420, 126.7010, 150],
    ],
    spawns: {
      ic_cityhall: [37.4540, 126.7000, 37.4580, 126.7100, '인천시청 · 구월동', 1],
      ic_bupyeong: [37.4870, 126.7180, 37.4900, 126.7260, '부평역 · 부평대로', 1],
      ic_juan: [37.4640, 126.6750, 37.4660, 126.6850, '주안역 · 주안로', 1],
      ic_chinatown: [37.4740, 126.6200, 37.4750, 126.6300, '인천역 · 차이나타운', 1],
      ic_songdo: [37.3900, 126.6350, 37.3950, 126.6420, '송도 센트럴파크', 1],
      ic_munhak: [37.4350, 126.6880, 37.4400, 126.6940, '문학경기장', 1],
      ic_east: [37.3890, 126.7450, 37.3900, 126.7350, '영동고속도로 끝 · 인천 (시내 방향)', 1],
    },
    routes: [
      ['trunk', 'I1', '인천 간선 I1', '부평역 ↔ 인천시청 ↔ 구월동 ↔ 문학경기장 ↔ 송도', 'i_ic', [[37.4895, 126.7245], [37.4563, 126.7052], [37.4480, 126.7020], [37.4370, 126.6930], [37.3925, 126.6390]]],
      ['trunk', 'I2', '인천 간선 I2', '인천역 ↔ 동인천 ↔ 제물포 ↔ 주안 ↔ 부평역 (경인로)', 'i_ic', [[37.4760, 126.6170], [37.4752, 126.6325], [37.4665, 126.6565], [37.4650, 126.6800], [37.4895, 126.7245]]],
      ['branch', 'I3', '인천 지선 I3', '인하대 ↔ 주안 ↔ 인천시청 ↔ 인천터미널', 'i_ic', [[37.4505, 126.6560], [37.4650, 126.6800], [37.4563, 126.7052], [37.4420, 126.7010]]],
    ],
  },
  {
    id: 'gimpo', name: '김포공항', mod: './rg_gimpo.js', bbox: [126.775, 126.84, 37.545, 37.575], noAuto: true,
    places: [['김포국제공항 국내선', 37.5622, 126.8011, 300], ['김포국제공항 국제선', 37.5658, 126.8020, 250], ['롯데몰 김포공항', 37.5605, 126.8045, 200]],
    spawns: { gp_terminal: [37.5612, 126.7990, 37.5616, 126.8040, '김포공항 국내선 청사 앞', 1] },
    routes: [],
  },
  {
    id: 'gimhae', name: '김해공항', mod: './rg_gimhae.js', bbox: [128.92, 128.958, 35.155, 35.19], noAuto: true,
    places: [['김해국제공항 국내선', 35.1730, 128.9475, 300], ['김해국제공항 국제선', 35.1735, 128.9440, 250]],
    spawns: { gh_terminal: [35.1722, 128.9455, 35.1724, 128.9500, '김해공항 청사 앞', 1] },
    routes: [],
  },
  {
    id: 'jeju', name: '제주', mod: './rg_jeju.js', bbox: [126.47, 126.56, 33.48, 33.52], noAuto: true,
    places: [['제주국제공항', 33.5070, 126.4930, 350], ['제주시청', 33.4996, 126.5312, 150], ['탑동광장 · 제주항 쪽 바다', 33.5155, 126.5225, 250], ['동문재래시장', 33.5120, 126.5280, 150], ['용두암', 33.5160, 126.5120, 200], ['한라수목원 가는 길 · 연동', 33.4880, 126.4950, 200]],
    spawns: {
      jj_airport: [33.5055, 126.4925, 33.5045, 126.4990, '제주공항 앞 · 공항로', 1],
      jj_city: [33.4990, 126.5270, 33.5000, 126.5340, '제주시청 · 광양사거리', 1],
      jj_tapdong: [33.5135, 126.5200, 33.5140, 126.5270, '탑동 · 바닷가', 1],
      jj_nohyeong: [33.4850, 126.4800, 33.4870, 126.4880, '노형 · 연동 신제주', 1],
    },
    routes: [
      ['trunk', 'J1', '제주 간선 J1', '제주공항 ↔ 신제주 ↔ 제주시청 ↔ 동문시장', 'j_jj', [[33.5055, 126.4925], [33.4880, 126.4950], [33.4996, 126.5312], [33.5120, 126.5280]]],
    ],
  },
  {
    id: 'ulsan', name: '울산', mod: './rg_ulsan.js', bbox: [129.29, 129.37, 35.52, 35.57],
    places: [["울산시청", 35.5394, 129.3114, 200], ["삼산동 · 롯데백화점", 35.54, 129.339, 200], ["태화강 국가정원", 35.548, 129.2995, 200], ["태화강역", 35.539, 129.353, 200]],
    spawns: { us_station: [35.539, 129.35, 35.5394, 129.3512, "울산 · 태화강역 앞", 1], us_city: [35.5395, 129.32, 35.539899999999996, 129.3212, "울산 · 울산시청 · 삼산", 1] },
    routes: [],
  },
  {
    id: 'changwon', name: '창원', mod: './rg_changwon.js', bbox: [128.64, 128.72, 35.2, 35.26],
    places: [["창원시청", 35.228, 128.6818, 200], ["상남동", 35.222, 128.685, 200], ["용지호수공원", 35.235, 128.67, 200], ["창원중앙역", 35.243, 128.696, 200]],
    spawns: { cw_station: [35.241, 128.694, 35.2414, 128.6952, "창원 · 창원중앙역 앞", 1], cw_city: [35.226, 128.68, 35.2264, 128.68120000000002, "창원 · 창원시청 · 상남동", 1] },
    routes: [],
  },
  {
    id: 'jeonju', name: '전주', mod: './rg_jeonju.js', bbox: [127.1, 127.18, 35.8, 35.86],
    places: [["전주 한옥마을", 35.815, 127.153, 200], ["전북특별자치도청", 35.82, 127.109, 200], ["전주 객사", 35.818, 127.145, 200], ["전주역", 35.85, 127.161, 200]],
    spawns: { jj2_station: [35.848, 127.159, 35.8484, 127.1602, "전주 · 전주역 앞 · 백제대로", 1], jj2_hanok: [35.817, 127.149, 35.8174, 127.1502, "전주 · 한옥마을 · 기린대로", 1] },
    routes: [],
  },
  {
    id: 'cheongju', name: '청주', mod: './rg_cheongju.js', bbox: [127.42, 127.5, 36.6, 36.66],
    places: [["청주시청", 36.642, 127.489, 200], ["성안길", 36.635, 127.488, 200], ["충북대학교", 36.628, 127.456, 200], ["청주고속버스터미널", 36.626, 127.432, 200]],
    spawns: { cj_terminal: [36.625, 127.433, 36.6254, 127.4342, "청주 · 청주 터미널 앞", 1], cj_city: [36.638, 127.486, 36.6384, 127.4872, "청주 · 성안길 · 청주시청", 1] },
    routes: [],
  },
  {
    id: 'suwon', name: '수원', mod: './rg_suwon.js', bbox: [126.97, 127.05, 37.25, 37.3],
    places: [["수원 화성행궁", 37.2818, 127.0145, 200], ["팔달문", 37.277, 127.017, 200], ["수원시청", 37.2636, 127.0286, 200], ["수원역", 37.2659, 127.0001, 200]],
    spawns: { sw_station: [37.2655, 127.002, 37.2659, 127.00319999999999, "수원 · 수원역 앞", 1], sw_hwaseong: [37.279, 127.015, 37.2794, 127.0162, "수원 · 화성행궁 · 팔달문", 1] },
    routes: [],
  },
  {
    id: 'pohang', name: '포항', mod: './rg_pohang.js', bbox: [129.32, 129.4, 36.0, 36.08],
    places: [["영일대해수욕장", 36.057, 129.379, 200], ["죽도시장", 36.035, 129.366, 200], ["포항시청", 36.019, 129.343, 200], ["포항역", 36.0716, 129.342, 200]],
    spawns: { ph_station: [36.07, 129.343, 36.0704, 129.3442, "포항 · 포항역 앞", 1], ph_beach: [36.056, 129.376, 36.0564, 129.37720000000002, "포항 · 영일대 해수욕장", 1] },
    routes: [],
  },
  {
    id: 'gangneung', name: '강릉', mod: './rg_gangneung.js', bbox: [128.86, 128.96, 37.74, 37.81],
    places: [["경포해변", 37.8055, 128.908, 200], ["안목 커피거리", 37.772, 128.948, 200], ["강릉시청", 37.752, 128.876, 200], ["강릉역", 37.764, 128.899, 200]],
    spawns: { gn_station: [37.763, 128.897, 37.7634, 128.8982, "강릉 · 강릉역 앞", 1], gn_gyeongpo: [37.799, 128.9, 37.7994, 128.90120000000002, "강릉 · 경포해변 쪽", 1] },
    routes: [],
  },
  {
    id: 'chuncheon', name: '춘천', mod: './rg_chuncheon.js', bbox: [127.69, 127.76, 37.85, 37.9],
    places: [["명동 닭갈비골목", 37.88, 127.728, 200], ["춘천시청", 37.8813, 127.7299, 200], ["남춘천역", 37.864, 127.724, 200], ["춘천역", 37.8847, 127.717, 200]],
    spawns: { cc_station: [37.884, 127.719, 37.8844, 127.72019999999999, "춘천 · 춘천역 앞", 1], cc_city: [37.88, 127.726, 37.8804, 127.7272, "춘천 · 춘천 명동 · 시청", 1] },
    routes: [],
  },
  {
    id: 'mokpo', name: '목포', mod: './rg_mokpo.js', bbox: [126.36, 126.44, 34.77, 34.82],
    places: [["유달산", 34.793, 126.376, 200], ["평화광장", 34.797, 126.43, 200], ["목포 근대역사관", 34.788, 126.382, 200], ["목포역", 34.791, 126.387, 200]],
    spawns: { mp_station: [34.79, 126.389, 34.7904, 126.3902, "목포 · 목포역 앞", 1], mp_peace: [34.796, 126.427, 34.7964, 126.4282, "목포 · 평화광장 · 바닷가", 1] },
    routes: [],
  },
  {
    id: 'yeosu', name: '여수', mod: './rg_yeosu.js', bbox: [127.7, 127.78, 34.72, 34.77],
    places: [["오동도", 34.744, 127.766, 200], ["이순신광장", 34.739, 127.736, 200], ["여수 낭만포차 거리", 34.738, 127.733, 200], ["여수엑스포역", 34.753, 127.748, 200]],
    spawns: { ys_station: [34.752, 127.746, 34.7524, 127.74719999999999, "여수 · 여수엑스포역 앞", 1], ys_city: [34.74, 127.738, 34.7404, 127.7392, "여수 · 이순신광장 · 중앙동", 1] },
    routes: [],
  },
  {
    id: 'suncheon', name: '순천', mod: './rg_suncheon.js', bbox: [127.46, 127.54, 34.92, 34.97],
    places: [["순천만국가정원", 34.9293, 127.496, 200], ["순천시청", 34.951, 127.487, 200], ["순천 웃장", 34.958, 127.492, 200], ["순천역", 34.946, 127.503, 200]],
    spawns: { sc_station: [34.945, 127.501, 34.9454, 127.5022, "순천 · 순천역 앞", 1], sc_garden: [34.931, 127.499, 34.9314, 127.50019999999999, "순천 · 순천만국가정원 앞", 1] },
    routes: [],
  },
  {
    id: 'gyeongju', name: '경주', mod: './rg_gyeongju.js', bbox: [129.19, 129.24, 35.82, 35.85],
    places: [["대릉원", 35.835, 129.212, 200], ["첨성대", 35.8347, 129.219, 200], ["동궁과 월지", 35.834, 129.2265, 200], ["황리단길", 35.837, 129.21, 200], ["경주고속버스터미널", 35.8385, 129.2045, 200]],
    spawns: { gj2_terminal: [35.838, 129.206, 35.8384, 129.2072, "경주 · 경주 터미널 앞", 1], gj2_daereung: [35.836, 129.21, 35.8364, 129.21120000000002, "경주 · 대릉원 · 황리단길", 1] },
    routes: [],
  },
];
import { initCorridor, corrGround, registerCorridor, CORR } from './corridor.js';
import { initRegion, regionAt, regionWater } from './region.js';
import { addPlaces, markSchoolZones } from './places.js';
import { addSubwayLines } from './subway.js';
import { toXZ, toLL, A as ANCH, ZONES, URBAN, LANDMARKS, RIVERS, LAKES, MOUNTAINS, SCALE } from './gwangju.js';
import {
  W, LANE_W, SIDEWALK, HWY_Y, buildNetwork, buildNetworkOSM, appendNetworkOSM, addCorridorNetwork, joinCorridorEnd, roadInfoAt as rInfo, edgesNear, segDist, addBox, addCircle, addOBox, queryColliders,
  lanePos, laneOff, linkBetween, nodeAt, signalState, linkY, edgeY, railPoint, railDist, obNearest,
} from './roadnet.js';
export { W, LANE_W, SIDEWALK, HWY_Y, addBox, addCircle, addOBox, queryColliders, lanePos, laneOff, linkBetween, nodeAt, signalState, linkY, edgeY, railPoint, railDist, obNearest, edgesNear };

// 예전 격자 지도용 상수 (사용 안 함, 다른 모듈 호환용)
export const UP = { x: 1e9, hw: 0, z0: 0, z1: 0, zf0: 0, zf1: 0, depth: 0 };
export const RAIL_Z = 1e9;
export const TOLL_Z = 1e9;
export let UG = null;
const R = mulberry(777);
const rr = (a, b) => a + R() * (b - a);
const ROADY = 0.06;

// ---------- 지형 (산 높이 격자) ----------
const TG = { step: 16, x0: 0, z0: 0, nx: 0, nz: 0, h: null, water: null, road: null };
export function terrainH(x, z) {
  if (!TG.h) return 0;
  const fx = (x - TG.x0) / TG.step, fz = (z - TG.z0) / TG.step;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= TG.nx - 1 || j >= TG.nz - 1) return 0;
  const u = fx - i, v = fz - j, n = TG.nx;
  const h = TG.h;
  return (h[j * n + i] * (1 - u) + h[j * n + i + 1] * u) * (1 - v) + (h[(j + 1) * n + i] * (1 - u) + h[(j + 1) * n + i + 1] * u) * v;
}
function waterAt(x, z) {
  if (!TG.water) return false;
  const i = Math.floor((x - TG.x0) / 8), j = Math.floor((z - TG.z0) / 8);
  if (i < 0 || j < 0 || i >= TG.wnx || j >= TG.wnz) return false;
  return TG.water[j * TG.wnx + i] === 1;
}

// 위치 정보 (도로 · 주차장 · 휴게시설)
export function roadInfoAt(x, z, level) {
  const r = rInfo(x, z, level);
  if (r) return r;
  if (W.parkingArea && x > W.parkingArea.x0 && x < W.parkingArea.x1 && z > W.parkingArea.z0 && z < W.parkingArea.z1) return { name: '주차 연습장', type: '주차장', limit: 20, kind: 'lot' };
  for (const zn of W.zones) if ((zn.type === 'fuel' || zn.type === 'lot') && x > zn.x0 - 8 && x < zn.x1 + 8 && z > zn.z0 - 8 && z < zn.z1 + 8) return { name: zn.name, type: '주유소 · 주차장', limit: 20, kind: 'lot' };
  return { name: '', type: '', limit: 30, kind: 'off' };
}
export function zoneAt(x, z, type) {
  for (const zn of W.zones) if ((!type || zn.type === type) && x > zn.x0 && x < zn.x1 && z > zn.z0 && z < zn.z1) return zn;
  return null;
}
export function onBump(x, z) {
  for (const b of W.bumps) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}
export function roadY() { return 0; }
// 산 터널 안(도로 폭)은 산 높이를 무시
function inTunnel(x, z) {
  if (!TG.tun) return false;
  const i = Math.floor((x - TG.x0) / 4), j = Math.floor((z - TG.z0) / 4);
  if (i < 0 || j < 0 || i >= TG.tnx || j >= TG.tnz) return false;
  return TG.tun[j * TG.tnx + i] === 1;
}
const inTG = (x, z) => TG.h && x >= TG.x0 && z >= TG.z0 && x < TG.x0 + (TG.nx - 1) * TG.step && z < TG.z0 + (TG.nz - 1) * TG.step;
export function groundY(x, z) {
  if (regionAt(x, z)) return 0;
  if (CORR.on && !inTG(x, z)) { const g = corrGround(x, z); return g.tunnel ? 0 : Math.max(0, Math.min(g.h, 400)); }
  return inTunnel(x, z) ? 0 : Math.max(0, terrainH(x, z));
}
export function blocked(x, z) {
  const b = W.bounds;
  if (regionAt(x, z, -20)) {
    if (regionWater(x, z) && !rInfo(x, z, 'surface')) { const r = rInfo(x, z); if (!r || Math.abs(r.y) > 1.5) return true; }
    return false;
  }
  if (b && (x < b.x0 + 20 || x > b.x1 - 20 || z < b.z0 + 20 || z > b.z1 - 20)) {
    // 지도 밖: 서울 가는 고속도로 둘레만 갈 수 있음
    if (!CORR.on) return true;
    const g = corrGround(x, z);
    return !!g.off || (!g.tunnel && g.h > 2.2);
  }
  if (waterAt(x, z) && !rInfo(x, z, 'surface')) { const r = rInfo(x, z); if (!r || Math.abs(r.y) > 1.5) return true; } // 물 위: 다리 시작(낮은 경사로)은 통과
  if (terrainH(x, z) > 2.2 && !inTunnel(x, z)) return true;
  return false;
}
// 층(지상/지하주차장/고가도로)을 고려한 바닥 높이
export function levelAt(x, z, level) {
  if (UG) {
    const r = UG.ramp;
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
      const t = (x - r.x0) / (r.x1 - r.x0);
      return { y: lerp(0.06, UG.y, t), level: t > 0.5 ? 'ug' : 'surface', ramp: t };
    }
    if (level === 'ug') return { y: UG.y, level: 'ug' };
  }
  if (level === 'hwy') {
    const r = rInfo(x, z, 'hwy');
    if (r) { if (r.edge.ramp && Math.abs(r.y) < 0.35) return { y: r.y, level: 'surface' }; return { y: r.y, level: 'hwy' }; }
    return { y: groundY(x, z), level: 'surface' };
  }
  // 지상에서 나들목 연결로에 올라서면 고가 층으로
  for (const e of edgesNear(x, z)) {
    if (!e.ramp) continue;
    const s = (x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z;
    if (s < 0 || s > e.len) continue;
    const lat = (x - e.a.x) * -e.dir.z + (z - e.a.z) * e.dir.x;
    if (Math.abs(lat) > e.hw) continue;
    const y = edgeY(e, s);
    if (Math.abs(y) > 0.15 && Math.abs(y) < 1.3) return { y, level: 'hwy' };
  }
  return { y: groundY(x, z), level: 'surface' };
}

// 신호등 색 갱신
const SIGC = { off: new THREE.Color(0x202224), r: new THREE.Color(0xff2a1a), y: new THREE.Color(0xffb000), g: new THREE.Color(0x19e07a) };
export function updateSignals(t) {
  const m = W.signalMesh; if (!m) return;
  for (const sl of W.signalLamps) {
    const st = signalState(sl.node, sl.axis, t);
    const red = st.s === 'R' && st.l !== 'Y';
    const yel = st.s === 'Y' || st.l === 'Y';
    m.setColorAt(sl.idx, red ? SIGC.r : SIGC.off);
    m.setColorAt(sl.idx + 1, yel ? SIGC.y : SIGC.off);
    m.setColorAt(sl.idx + 2, st.l === 'G' ? SIGC.g : SIGC.off);
    m.setColorAt(sl.idx + 3, st.s === 'G' ? SIGC.g : SIGC.off);
  }
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

// ===================== 정류장 & 노선 =====================
const usedStopNames = new Map();
function stopNameFor(L) {
  const e = L.edge;
  if (e.stopName) return e.stopName;
  const mx0 = (e.a.x + e.b.x) / 2, mz0 = (e.a.z + e.b.z) / 2;
  let name = null, bd = 150;
  for (const l of W.landmarks) {
    if (l.river || / 다리$|건널목|입구|연습장|지하|톨게이트|굽은|나들목|IC|주유소|충전소/.test(l.name)) continue;
    const d = Math.hypot(l.x - mx0, l.z - mz0) - (l.r || 40) * 0.4;
    if (d < bd && !usedStopNames.has(l.name)) { bd = d; name = l.name.replace(/ \(.*\)/, ''); }
  }
  if (!name) {
    // 가까운 교차로 이름 (두 도로 이름) 또는 동 이름
    const n = e.a.edges.length >= 3 ? e.a : e.b.edges.length >= 3 ? e.b : null;
    const dong = dongAt(mx0, mz0) || e.name || '휴게';
    let k = usedStopNames.get(dong) || 0;
    if (n && k >= 2) {
      const other = n.edges.find((x) => x.name !== e.name);
      if (other && !usedStopNames.has(other.name + '입구')) name = other.name + '입구';
    }
    if (!name) {
      name = dong + STOP_SUFFIX[k % STOP_SUFFIX.length] + (k >= STOP_SUFFIX.length ? ' ' + (Math.floor(k / STOP_SUFFIX.length) + 1) : '');
      usedStopNames.set(dong, k + 1);
    }
  }
  usedStopNames.set(name, 1);
  e.stopName = name;
  return name;
}
function ensureStop(L) {
  if (L.stop) return L.stop;
  const s = L.s0 + (L.s1 - L.s0) * 0.45;
  const lat = L.median / 2 + L.n * LANE_W + L.edge.shoulder;
  const P2 = (ss, la) => ({ x: L.from.x + L.dir.x * ss + L.right.x * la, z: L.from.z + L.dir.z * ss + L.right.z * la });
  const name = W.landmarks.length ? stopNameFor(L) : '';
  const st = {
    id: W.stops.length, name, link: L, s, heading: L.heading, routes: [], waiting: 0, peds: [],
    curb: P2(s, lat), door: P2(s, lat - 0.45), wait: P2(s - 0.5, lat + 1.4),
  };
  st.gu = guAt(st.curb.x, st.curb.z);
  W.stops.push(st); L.stop = st;
  return st;
}
// 링크 그래프 최단 경로 (버스 노선용: 큰길 선호, 고속도로 제외)
let PL = null;
export function pathLinks(fromNode, toNode, opts = {}) {
  if (fromNode === toNode) return [];
  const NL = W.links.length;
  if (!PL || PL.n !== NL) {
    W.links.forEach((L, i) => (L.idx = i));
    PL = { n: NL, g: new Float64Array(NL), prev: new Int32Array(NL), st: new Uint32Array(NL), done: new Uint32Array(NL), stamp: 0 };
  }
  const st = ++PL.stamp, g = PL.g, prev = PL.prev, mark = PL.st, done = PL.done;
  const heap = new MinHeap();
  const OSMW = [0.7, 0.72, 0.78, 0.95, 1.15, 1.9];
  const tx = toNode.x, tz = toNode.z, hk = W.osm ? 0.7 : 0.8;
  const cost = (L) => {
    const e = L.edge, k = e.kind;
    if ((k === 'highway' || k === 'ic') && !opts.hwy) return Infinity;
    if (e.osm !== undefined) return L.len * OSMW[e.osm] + (L.to.signal ? 12 : 0);
    let c = L.len * (L.n >= 3 ? 0.8 : L.n === 2 ? 1 : k === 'alley' ? 2.4 : 1.35);
    if (k === 'mountain') c *= 1.2;
    return c;
  };
  const hOf = (L) => Math.hypot(L.to.x - tx, L.to.z - tz) * hk;
  for (const L of fromNode.out) { const c = cost(L); if (c < Infinity) { g[L.idx] = c; mark[L.idx] = st; prev[L.idx] = -1; heap.push(c + hOf(L), L); } }
  const maxN = opts.maxN || 160000;
  let n = 0;
  while (heap.size) {
    const L = heap.pop(), li = L.idx;
    if (done[li] === st) continue; done[li] = st;
    if (L.to === toNode) {
      const out = [L]; let p = prev[li];
      while (p >= 0) { out.unshift(W.links[p]); p = prev[p]; }
      return out;
    }
    const c = g[li];
    for (const O of L.to.out) {
      if (O === L.rev && L.to.out.length > 1) continue;
      const oc = cost(O); if (oc === Infinity) continue;
      const nc = c + oc + (O.dir.x * L.dir.x + O.dir.z * L.dir.z < -0.2 ? 40 : 0), oi = O.idx;
      if (mark[oi] !== st || nc < g[oi]) { mark[oi] = st; g[oi] = nc; prev[oi] = li; heap.push(nc + hOf(O), O); }
    }
    if (++n > maxN) break;
  }
  return null;
}
const anchorN = (name) => W.anchorNode[name] || null;
// 모퉁이/기준점 목록 → 순환 링크 목록. pts: 기준점 이름 또는 [x,z]
export function linksFromPts(pts, opts = {}) {
  const ns = pts.map((p) => (typeof p === 'string' ? anchorN(p) : nodeAt(p[0], p[1])));
  if (ns.some((n) => !n) || ns.length < 2) return null;
  const links = [];
  // 왕복(기본): 기점 → … → 종점 → (되돌아) … → 기점  /  순환(loop): 마지막에서 처음으로 바로 돌아옴
  const order = opts.loop ? [...ns, ns[0]] : [...ns, ...ns.slice(0, -1).reverse()];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i], b = order[i + 1];
    if (a === b) continue;
    const seg = pathLinks(a, b, opts) || (!opts.hwy && pathLinks(a, b, { ...opts, hwy: true }));
    if (!seg) return null;
    links.push(...seg);
  }
  return links.length ? links : null;
}
// 노선 등록 (런타임에 관리자 모드에서 새 노선을 추가할 때도 사용)
export function registerRoute(R0) {
  const T = BUS_TYPES[R0.type] || BUS_TYPES.trunk;
  const loop = R0.loop ?? (R0.type === 'village');
  const links = R0.links || (R0.realStops ? linksFromStops(R0.realStops) : linksFromPts(R0.via || R0.pts, { hwy: R0.type === 'seat', loop }));
  if (!links) { console.warn('route invalid', R0.id); return null; }
  if (R0.realStops && R0.keys && R0.stopDB) return finishRoute(R0, loop, links, realStopsOn(stopsAlong(links, R0.stopDB), links));
  if (R0.realStops) return finishRoute(R0, loop, links, realStopsOn(R0.realStops, links));
  const gap = (T.stopEvery > 1 ? 430 : R0.type === 'village' ? 170 : 210) * (W.osm ? 1.9 : 1);
  const stops = [];
  let acc = gap * 0.6;
  for (const L of links) {
    acc += L.len;
    if (L.edge.elevated || L.edge.ramp || L.edge.kind === 'highway') continue;
    if (L.s1 - L.s0 < 36) continue;
    if (acc >= gap || (L.stop && acc > gap * 0.5)) { const st = ensureStop(L); if (!stops.includes(st)) { stops.push(st); acc = 0; } }
  }
  return finishRoute(R0, loop, links, stops);
}
// 실제 정류장 자리마다 그 정류장을 오른쪽에 두고 지나는 차선 → 차례로 이어 순환 노선
function stopLinksAt(x, z) {
  const c = [];
  const seen = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const e of edgesNear(x + dx * 60, z + dz * 60)) {
    if (seen.has(e)) continue; seen.add(e);
    if (e.ramp || e.kind === 'highway' || e.kind === 'ic' || e.kind === 'alley' || e.len < 16) continue;
    for (const L of [e.fwd, e.bwd]) {
      if (!L) continue;
      const d = segDist(x, z, L.from.x, L.from.z, L.to.x, L.to.z) + (e.elevated ? 15 : 0);
      if (d > 70) continue;
      const side = (x - L.from.x) * L.right.x + (z - L.from.z) * L.right.z;
      c.push({ L, sc: d + (side < -1 ? 60 : 0) });
    }
  }
  return c.sort((p, q) => p.sc - q.sc).slice(0, 5);
}
function linksFromStops(list) {
  const plen = (p) => p.reduce((a, L) => a + L.len, 0);
  const join = (A, B) => {
    if (A === B || A.to === B.from) return [];
    const p = pathLinks(A.to, B.to) || pathLinks(A.to, B.to, { hwy: true });
    if (p && p[p.length - 1] === B) return p.slice(0, -1);
    return pathLinks(A.to, B.from) || pathLinks(A.to, B.from, { hwy: true });
  };
  // 정류장마다 후보 차선(양방향) 중, 앞뒤 정류장과 가장 자연스럽게 이어지는 조합 (비터비)
  const layers = [];
  let skip = 0;
  for (const [, x, z] of list) {
    const C = stopLinksAt(x, z).slice(0, 4); if (!C.length) { skip++; continue; }
    const emit = C.map((c) => c.sc * 8);
    if (!layers.length) { layers.push({ C, cost: emit, back: C.map(() => -1), seg: C.map(() => null), x, z }); continue; }
    const P = layers[layers.length - 1];
    const cost = [], back = [], seg = [];
    let minLen = Infinity;
    for (let j = 0; j < C.length; j++) {
      let bc = Infinity, bi = -1, bs = null;
      for (let i = 0; i < P.C.length; i++) {
        if (P.cost[i] === Infinity) continue;
        const sg = join(P.C[i].L, C[j].L); if (!sg || sg.length > 400) continue;
        const pl = plen(sg); if (pl < minLen) minLen = pl;
        const v = P.cost[i] + pl + (P.C[i].L === C[j].L ? 0 : C[j].L.len * 0.3) + emit[j];
        if (v < bc) { bc = v; bi = i; bs = sg; }
      }
      cost.push(bc); back.push(bi); seg.push(bs);
    }
    // 앞 정류장에서 너무 멀리 돌아야 닿는 정류장은 건너뜀 (지도 연결이 끊긴 곳)
    if (cost.every((v) => v === Infinity) || minLen > Math.hypot(x - P.x, z - P.z) * 4 + 2000) { skip++; continue; }
    layers.push({ C, cost, back, seg, x, z });
  }
  if (layers.length < 4 || skip > list.length * 0.4) return null;
  // 거꾸로 따라가며 고른 차선
  let k = layers.length - 1, j = 0;
  layers[k].cost.forEach((v, q) => { if (v < layers[k].cost[j]) j = q; });
  const pick = [];
  for (; k >= 0; k--) { pick.unshift({ L: layers[k].C[j].L, seg: layers[k].seg[j] }); j = layers[k].back[j]; }
  const out = [pick[0].L];
  for (let q = 1; q < pick.length; q++) {
    const { L, seg } = pick[q];
    if (W._dbgStops) W._dbgStops.push([Math.hypot(L.to.x - out[out.length - 1].to.x, L.to.z - out[out.length - 1].to.z), plen(seg) + L.len, out[out.length - 1], L]);
    if (L === out[out.length - 1] && !seg.length) continue;
    out.push(...seg, L);
  }
  const first = out[0], cur = out[out.length - 1];
  if (cur !== first) { const sg = join(cur, first); if (!sg) return null; out.push(...sg); }
  return out;
}
// 노선이 지나는 길 오른쪽의 실제 정류장들을 지나는 순서대로 (주요 경유지만 아는 노선용)
function stopsAlong(links, db) {
  const G = db._grid || (db._grid = (() => { const m = new Map(); for (const q of db) { const k = Math.floor(q[1] / 100) + ',' + Math.floor(q[2] / 100); let a = m.get(k); if (!a) m.set(k, a = []); a.push(q); } return m; })());
  const hits = [];
  let c0 = 0;
  for (const L of links) {
    const e = L.edge;
    if (!(e.elevated || e.ramp || e.kind === 'highway' || e.kind === 'ic')) {
      const x0 = Math.min(L.from.x, L.to.x) - 30, x1 = Math.max(L.from.x, L.to.x) + 30, z0 = Math.min(L.from.z, L.to.z) - 30, z1 = Math.max(L.from.z, L.to.z) + 30;
      for (let gx = Math.floor(x0 / 100); gx <= Math.floor(x1 / 100); gx++) for (let gz = Math.floor(z0 / 100); gz <= Math.floor(z1 / 100); gz++) {
        for (const q of G.get(gx + ',' + gz) || []) {
          const rx = q[1] - L.from.x, rz = q[2] - L.from.z;
          const t = rx * L.dir.x + rz * L.dir.z; if (t < -5 || t > L.len + 5) continue;
          const side = rx * L.right.x + rz * L.right.z;
          if (side < 2 || side > 28) continue;
          hits.push([c0 + t, q]);
        }
      }
    }
    c0 += L.len;
  }
  hits.sort((a, b) => a[0] - b[0]);
  const out = [];
  let last = -1e9, lastName = '';
  for (const [pos, q] of hits) {
    if (pos - last < 140 || (q[0] === lastName && pos - last < 400)) continue;
    out.push(q); last = pos; lastName = q[0];
  }
  return out;
}
// 실제 정류장 자리 → 노선이 지나는 링크 위 정류장 (이름은 실제 이름)
function realStopsOn(list, links) {
  const stops = [];
  let from = 0;
  for (const [name, x, z] of list) {
    let best = null, bd = 60, bk = -1;
    // 노선 순서대로 앞쪽에서 먼저 찾음 (같은 길을 되돌아오는 노선이라도 맞는 방향 정류장)
    for (let t = 0; t < links.length; t++) {
      const k = (from + t) % links.length, L = links[k], e = L.edge;
      if (e.elevated || e.ramp || e.kind === 'highway' || L.s1 - L.s0 < 14) continue;
      const d = segDist(x, z, L.from.x, L.from.z, L.to.x, L.to.z);
      const side = (x - L.from.x) * L.right.x + (z - L.from.z) * L.right.z;
      const sc = d + (side < -2 ? 25 : 0) + t * 0.02;
      if (sc < bd) { bd = sc; best = L; bk = k; }
      if (t > 400 && best) break;
    }
    if (!best) continue;
    from = bk;
    const st = ensureStop(best);
    if (!st.real) { st.name = name; st.real = true; usedStopNames.set(name, 1); }
    if (stops[stops.length - 1] !== st) stops.push(st);
  }
  return stops;
}
function finishRoute(R0, loop, links, stops) {
  stops.forEach((s) => { if (!s.routes.includes(R0.id)) s.routes.push(R0.id); });
  const len = links.reduce((a, L) => a + L.len, 0);
  const old = W.routes.findIndex((r) => r.id === R0.id);
  const R2 = { ...R0, loop, links, stops, len, color: R0.color || ROUTE_COLORS[R0.type] || '#2a63d4', stopLinks: new Set(stops.map((s) => s.link.id)) };
  if (old >= 0) W.routes[old] = R2; else W.routes.push(R2);
  return R2;
}
function buildRoutes(extra = []) {
  for (const R0 of [...ROUTES, ...extra]) registerRoute(R0);
}

// ===================== 텍스처 =====================
function noiseFill(g, w, h, base, amt) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
function makeTextures() {
  const T = {};
  T.asphalt = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#56595c', 30);
    for (let k = 0; k < 8; k++) { g.fillStyle = `rgba(25,25,28,${0.04 + Math.random() * 0.07})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 10 + Math.random() * 30, Math.random() * 3, 0, TAU); g.fill(); }
  }, { repeat: true });
  T.sidewalk = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9d9a95'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
      const v = 178 + Math.random() * 26; const red = y === 128;
      g.fillStyle = red ? `rgb(${v - 10},${v - 60},${v - 70})` : `rgb(${v},${v - 4},${v - 10})`;
      g.fillRect(x + 1, y + 1, 30, 14);
    }
  }, { repeat: true });
  T.grass = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#5d8a45', 40);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${100 + Math.random() * 50},40,0.25)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 16, 0, TAU); g.fill(); }
  }, { repeat: true });
  T.concrete = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#a7a8a4', 22), { repeat: true });
  T.sand = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#d8c79a', 26), { repeat: true });
  T.dirt = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#7d6a4c', 30), { repeat: true });

  const win = (night, kind) => canvasTex(256, 256, (g, w, h) => {
    const lit = () => Math.random() < 0.42;
    if (kind === 'office') {
      g.fillStyle = night ? '#000' : '#6a7684'; g.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
        const x = fx * 64 + 5, y = fy * 64 + 8;
        if (night) { g.fillStyle = lit() ? (Math.random() < 0.5 ? '#ffe2b0' : '#cfe6ff') : '#000'; g.fillRect(x, y, 54, 50); }
        else { const gr = g.createLinearGradient(x, y, x + 54, y + 50); gr.addColorStop(0, '#8fb3d1'); gr.addColorStop(1, '#2f4d6b'); g.fillStyle = gr; g.fillRect(x, y, 54, 50); }
      }
    } else if (kind === 'apt') {
      g.fillStyle = night ? '#000' : '#ece9e2'; g.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 2; fx++) {
        const x = fx * 128 + 10, y = fy * 64 + 14;
        if (night) { g.fillStyle = lit() ? '#ffd9a0' : '#000'; g.fillRect(x, y, 108, 34); }
        else { g.fillStyle = '#7d93a6'; g.fillRect(x, y, 108, 34); g.fillStyle = '#d7d4cc'; g.fillRect(x, y + 26, 108, 3); g.fillStyle = '#5c6f80'; g.fillRect(x + 52, y, 4, 34); }
      }
    } else if (kind === 'shop') {
      g.fillStyle = night ? '#000' : '#e6e2da'; g.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
        const x = fx * 128 + 18, y = fy * 128 + 26;
        if (night) { g.fillStyle = lit() ? '#ffe6b8' : '#000'; g.fillRect(x, y, 92, 70); }
        else { g.fillStyle = '#4f6578'; g.fillRect(x, y, 92, 70); g.fillStyle = '#ddd'; g.fillRect(x + 44, y, 4, 70); }
      }
    } else {
      g.fillStyle = night ? '#000' : '#b9bfc4'; g.fillRect(0, 0, w, h);
      if (!night) for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 3, h); }
    }
  }, { repeat: true });
  for (const k of ['office', 'apt', 'shop', 'factory']) { T[k] = win(false, k); T[k + 'N'] = win(true, k); }

  const arrow = (type) => canvasTex(128, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2f2'; g.strokeStyle = '#f2f2f2'; g.lineWidth = 16; g.lineCap = 'butt';
    const cx = w / 2;
    const head = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -34); g.lineTo(26, 6); g.lineTo(-26, 6); g.closePath(); g.fill(); g.restore(); };
    if (type.includes('S')) { g.beginPath(); g.moveTo(cx, h - 10); g.lineTo(cx, 60); g.stroke(); head(cx, 50, 0); }
    if (type.includes('L')) { g.beginPath(); g.moveTo(cx, h - 10); g.lineTo(cx, 170); g.quadraticCurveTo(cx, 130, cx - 30, 130); g.stroke(); head(cx - 40, 130, -Math.PI / 2); }
    if (type.includes('R')) { g.beginPath(); g.moveTo(cx, h - 10); g.lineTo(cx, 170); g.quadraticCurveTo(cx, 130, cx + 30, 130); g.stroke(); head(cx + 40, 130, Math.PI / 2); }
    if (type.includes('U')) { g.beginPath(); g.moveTo(cx + 22, h - 10); g.lineTo(cx + 22, 120); g.arc(cx, 120, 22, 0, Math.PI, true); g.lineTo(cx - 22, 220); g.stroke(); head(cx - 22, 236, Math.PI); }
  });
  T.arrows = {};
  for (const t of ['S', 'L', 'R', 'SR', 'SL', 'SLR', 'U']) T.arrows[t] = arrow(t);
  T.busText = canvasTex(128, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2f2'; g.font = '900 64px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
    ['버', '스', '전', '용'].forEach((c, i) => g.fillText(c, w / 2, 300 - i * 72));
  });
  T.bump = canvasTex(128, 32, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#f2c418' : '#151515'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, h); g.lineTo(x - 8, h); g.fill(); } });
  T.speed = {};
  for (const v of [30, 40, 50, 60, 100]) T.speed[v] = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.strokeStyle = '#d42a2a'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.stroke();
    g.fillStyle = '#111'; g.font = `900 ${v >= 100 ? 46 : 54}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), 64, 68);
  });
  return T;
}

function textBoard(lines, opts = {}) {
  const w = opts.w || 512, h = opts.h || 160;
  return canvasTex(w, h, (g) => {
    g.fillStyle = opts.bg || '#1a4fa6'; roundRect(g, 0, 0, w, h, 14); g.fill();
    if (!opts.noBorder) { g.strokeStyle = '#fff'; g.lineWidth = 5; roundRect(g, 6, 6, w - 12, h - 12, 10); g.stroke(); }
    g.fillStyle = opts.fg || '#fff'; g.textBaseline = 'middle'; g.textAlign = opts.align || 'center';
    const lh = (h - 20) / lines.length;
    lines.forEach((l, i) => {
      g.font = `${l.w || 800} ${Math.round(lh * (l.s || 0.62))}px "Noto Sans KR", sans-serif`;
      g.fillStyle = l.c || opts.fg || '#fff';
      g.fillText(l.t ?? l, opts.align === 'left' ? 24 : w / 2, 10 + lh * (i + 0.5), w - 30);
    });
  });
}

// ===================== 인스턴스 빌더 =====================
class Inst {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.list = []; }
  add(x, y, z, ry, sx, sy, sz, color, rx = 0) { this.list.push([x, y, z, ry, sx, sy, sz, color, rx]); }
  build(scene, opts = {}) {
    if (!this.list.length) return null;
    // 성능: 도시 전체를 한 덩어리로 그리지 않고 600m 칸으로 나눠 화면 밖·먼 곳은 건너뛰게 함
    const groups = new Map();
    if (opts.single) groups.set('all', this.list);
    else for (const a of this.list) { const k = Math.floor(a[0] / 600) + ',' + Math.floor(a[2] / 600); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eu = new THREE.Euler(), col = new THREE.Color();
    let first = null;
    for (const list of groups.values()) {
      const m = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      let cx = 0, cz = 0;
      const ox = Math.round(list[0][0] / 100) * 100, oz = Math.round(list[0][2] / 100) * 100;
      m.position.set(ox, 0, oz);
      list.forEach((a, i) => {
        q.setFromEuler(eu.set(a[8] || 0, a[3], 0, 'YXZ'));
        M4.compose(p.set(a[0] - ox, a[1], a[2] - oz), q, s.set(a[4], a[5], a[6]));
        m.setMatrixAt(i, M4);
        if (a[7] !== undefined) m.setColorAt(i, col.set(a[7]));
        cx += a[0]; cz += a[2];
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive;
      m.computeBoundingSphere();
      scene.add(m);
      if (opts.far && !opts.single) W.lod.push({ m, x: cx / list.length, z: cz / list.length, far: opts.far });
      if (!first) first = m;
    }
    return first;
  }
}
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);


// 이 점이 (자기 도로가 아닌) 어떤 지상 도로 위인지
function onAnyRoad(x, z, self, pad = 0.4, elev = false, y) {
  for (const e of edgesNear(x, z)) {
    if (e === self || (elev ? !(e.elevated || e.ramp) : e.elevated)) continue;
    const s = (x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z;
    if (s < -e.a.r * 0.8 || s > e.len + e.b.r * 0.8) continue;
    if (y !== undefined && Math.abs(edgeY(e, s) - y) > 3) continue;
    const lat = Math.abs((x - e.a.x) * -e.dir.z + (z - e.a.z) * e.dir.x);
    if (lat < e.hw + pad) return true;
  }
  return false;
}
// 도로 e 의 옆 위치 lat 를 따라 (폭 ±w) 다른 길과 겹치지 않는 구간들 [s0,s1]
function freeRanges(e, a, b, lat, w) {
  const out = []; let st = null;
  const elev = !!(e.elevated && Math.max(e.ya, e.yb) > 0.5);
  for (let s = a; s <= b + 0.01; s += 3) {
    const ss = Math.min(s, b);
    let hit = false;
    for (const l of [lat - w, lat, lat + w]) {
      const x = e.a.x + e.dir.x * ss - e.dir.z * l, z = e.a.z + e.dir.z * ss + e.dir.x * l;
      if (onAnyRoad(x, z, e, 0.1, elev, elev ? edgeY(e, ss) : undefined)) { hit = true; break; }
    }
    if (!hit && st === null) st = ss;
    if (hit && st !== null) { out.push([st, ss - 1.5]); st = null; }
  }
  if (st !== null) out.push([st, b]);
  return out;
}
// ===================== 삼각형 묶음 (임의 방향 판·띠) =====================
class Tris {
  constructor(tile = 400) { this.tile = tile; this.groups = new Map(); }
  get(mat, x, z) {
    const ti = Math.floor(x / this.tile), tj = Math.floor(z / this.tile);
    const k = mat.uuid + ':' + ti + ':' + tj;
    let g = this.groups.get(k);
    if (!g) { g = { mat, pos: [], col: [], ox: (ti + 0.5) * this.tile, oz: (tj + 0.5) * this.tile }; this.groups.set(k, g); }
    return g;
  }
  // 볼록 다각형 (y 포함 점 목록) — 위를 향함
  poly(mat, pts, color) {
    if (pts.length < 3) return;
    // 위를 향하도록 감는 방향 맞추기 (신발끈 공식)
    let ar = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ar += p[0] * q[2] - q[0] * p[2]; }
    if (ar < 0) pts = [...pts].reverse();
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
    const g = this.get(mat, cx, cz);
    const c = color !== undefined ? new THREE.Color(color) : null;
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i + 1], pts[i]]) { g.pos.push(p[0], p[1], p[2]); if (c) g.col.push(c.r, c.g, c.b); }
    }
  }
  quad(mat, a, b, c, d, color) { this.poly(mat, [a, b, c, d], color); }
  // 삼각형 하나 (점 순서 그대로)
  tri(mat, a, b, c, color, g0) {
    const g = g0 || this.get(mat, a[0], a[2]);
    const col = color !== undefined ? (color.isColor ? color : new THREE.Color(color)) : null;
    for (const p of [a, b, c]) { g.pos.push(p[0], p[1], p[2]); if (col) g.col.push(col.r, col.g, col.b); }
  }
  // 오목 다각형 (평면 xz, 높이 y) — 귀 자르기
  flat(mat, pts2, y, color) {
    if (pts2.length < 3) return;
    const ids = earcut2(pts2);
    const cx = pts2[0][0], cz = pts2[0][1];
    const g = this.get(mat, cx, cz);
    for (let i = 0; i < ids.length; i += 3) {
      const a = pts2[ids[i]], b = pts2[ids[i + 1]], c = pts2[ids[i + 2]];
      this.tri(mat, [a[0], y, a[1]], [c[0], y, c[1]], [b[0], y, b[1]], color, g);
    }
  }
  build(scene, opts = {}) {
    for (const g of this.groups.values()) {
      if (!g.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      const n = g.pos.length / 3, uv = new Float32Array(n * 2), pl = opts.planar || 8, lp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        uv[i * 2] = (g.pos[i * 3] - g.ox + (g.ox % 4096)) / pl; uv[i * 2 + 1] = (g.pos[i * 3 + 2] - g.oz + (g.oz % 4096)) / pl;
        lp[i * 3] = g.pos[i * 3] - g.ox; lp[i * 3 + 1] = g.pos[i * 3 + 1]; lp[i * 3 + 2] = g.pos[i * 3 + 2] - g.oz;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (g.col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, g.mat);
      m.position.set(g.ox, 0, g.oz);
      m.receiveShadow = opts.receive !== false; m.castShadow = !!opts.cast;
      scene.add(m);
    }
  }
}
// 다각형 안쪽 점을 step 간격으로 훑기 (스캔라인)
function rasterPoly(pts, step, fn) {
  let z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  for (let z = Math.floor(z0 / step) * step + step / 2; z <= z1; z += step) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= z) !== (b[1] <= z)) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.floor(xs[k] / step) * step + step / 2; x <= xs[k + 1]; x += step) if (x >= xs[k]) fn(x, z);
  }
}
// 귀 자르기 삼각분할 (구멍 없는 다각형) → 반시계(xz, 위에서 볼 때) 인덱스 3개씩
function earcut2(pts) {
  const n = pts.length;
  let ar = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; }
  const V = []; for (let i = 0; i < n; i++) V.push(ar > 0 ? i : n - 1 - i);
  const out = [];
  const cross = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
  const inTri = (a, b, c, p) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = n * n + 10, i = 0;
  while (V.length > 3 && guard-- > 0) {
    const m = V.length, ia = V[(i + m - 1) % m], ib = V[i % m], ic = V[(i + 1) % m];
    let ear = cross(ia, ib, ic) > 1e-9;
    if (ear) for (const j of V) { if (j === ia || j === ib || j === ic) continue; if (inTri(ia, ib, ic, j)) { ear = false; break; } }
    if (ear) { out.push(ia, ib, ic); V.splice(i % m, 1); i = Math.max(0, (i % m) - 1); } else i++;
    if (i > V.length * 2) { // 막히면 남은 부분은 부채꼴로
      for (let k = 1; k < V.length - 1; k++) out.push(V[0], V[k], V[k + 1]);
      return out;
    }
  }
  if (V.length === 3) out.push(V[0], V[1], V[2]);
  return out;
}
// 볼록 껍질
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[2] - o[2]) - (a[2] - o[2]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ===================== 점유 격자 (건물 겹침 방지) =====================
const OG = { cell: 4, x0: 0, z0: 0, nx: 0, nz: 0, a: null };
function ogInit(b) { OG.x0 = b.x0; OG.z0 = b.z0; OG.nx = Math.ceil((b.x1 - b.x0) / OG.cell); OG.nz = Math.ceil((b.z1 - b.z0) / OG.cell); OG.a = new Uint8Array(OG.nx * OG.nz); }
function ogCells(cx, cz, hx, hz, ang, fn) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  const i0 = Math.max(0, Math.floor((cx - ex - OG.x0) / OG.cell)), i1 = Math.min(OG.nx - 1, Math.floor((cx + ex - OG.x0) / OG.cell));
  const j0 = Math.max(0, Math.floor((cz - ez - OG.z0) / OG.cell)), j1 = Math.min(OG.nz - 1, Math.floor((cz + ez - OG.z0) / OG.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = OG.x0 + (i + 0.5) * OG.cell - cx, z = OG.z0 + (j + 0.5) * OG.cell - cz;
    // 로컬: u 는 ang 방향(sin,cos), v 는 옆
    const u = x * sn + z * cs, v = x * cs - z * sn;
    if (Math.abs(u) <= hz + 1 && Math.abs(v) <= hx + 1) if (fn(j * OG.nx + i) === false) return false;
  }
  return true;
}
const ogFree = (cx, cz, hx, hz, ang) => ogCells(cx, cz, hx, hz, ang, (k) => OG.a[k] === 0);
const ogMark = (cx, cz, hx, hz, ang, v = 1) => ogCells(cx, cz, hx, hz, ang, (k) => { OG.a[k] = v; });
function ogSeg(ax, az, bx, bz, hw, v = 1) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) return;
  ogMark((ax + bx) / 2, (az + bz) / 2, hw, len / 2, Math.atan2(bx - ax, bz - az), v);
}

// ===================== 월드 생성 =====================
// 체임퍼 거리 변환 (두 번 훑기) — 큰 함수 안에 두면 최적화가 안 돼서 따로 뺌
function chamfer(dist, nx, nz, step) {
  const S1 = step, S2 = step * 1.414;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let d = dist[k];
    if (i > 0 && dist[k - 1] + S1 < d) d = dist[k - 1] + S1;
    if (j > 0) {
      if (dist[k - nx] + S1 < d) d = dist[k - nx] + S1;
      if (i > 0 && dist[k - nx - 1] + S2 < d) d = dist[k - nx - 1] + S2;
      if (i < nx - 1 && dist[k - nx + 1] + S2 < d) d = dist[k - nx + 1] + S2;
    }
    dist[k] = d;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let d = dist[k];
    if (i < nx - 1 && dist[k + 1] + S1 < d) d = dist[k + 1] + S1;
    if (j < nz - 1) {
      if (dist[k + nx] + S1 < d) d = dist[k + nx] + S1;
      if (i < nx - 1 && dist[k + nx + 1] + S2 < d) d = dist[k + nx + 1] + S2;
      if (i > 0 && dist[k + nx - 1] + S2 < d) d = dist[k + nx - 1] + S2;
    }
    dist[k] = d;
  }
}
// ===================== 실제 건물: 미리 자리만 잡고, 모양은 플레이어 근처부터 조금씩 만듦 =====================
const BG = { cells: [], cur: null, scene: null, mats: null, done: 0 };
// 회전 상자 안쪽(가장자리 1.5m 안)에 도로 칸(점유 1)이 있는지
function boxOnRoad(cx, cz, hx, hz, ang) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  const i0 = Math.max(0, Math.floor((cx - ex - OG.x0) / OG.cell)), i1 = Math.min(OG.nx - 1, Math.floor((cx + ex - OG.x0) / OG.cell));
  const j0 = Math.max(0, Math.floor((cz - ez - OG.z0) / OG.cell)), j1 = Math.min(OG.nz - 1, Math.floor((cz + ez - OG.z0) / OG.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (OG.a[j * OG.nx + i] !== 1) continue;
    const x = OG.x0 + (i + 0.5) * OG.cell - cx, z = OG.z0 + (j + 0.5) * OG.cell - cz;
    const u = x * sn + z * cs, v = x * cs - z * sn;
    if (Math.abs(u) <= hz - 1.5 && Math.abs(v) <= hx - 1.5) return true;
  }
  return false;
}
const hrand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
function prepOsmBuildings(scene, zoneOf, mats, aptColors, shopColors) {
  BG.scene = scene; BG.mats = [mats.shop, mats.apt, mats.office, mats.factory, mats.roof]; BG.cells = []; BG.cur = null; BG.done = 0;
  const cellMap = new Map();
  const blds = GJ.blds;
  const officeC = [0xffffff, 0xdfe8f0, 0xe6f0f2, 0xd6dde6], factC = [0xd0d4d8, 0xb9c4cc, 0xe0dcd0];
  let made = 0;
  for (let i = 0; i < blds.length; i++) {
    const b = blds[i], n = (b.length - 1) >> 1;
    if (n < 3) continue;
    let ar = 0, cx = 0, cz = 0;
    for (let k = 0; k < n; k++) {
      const px = b[1 + k * 2], pz = b[2 + k * 2], k2 = (k + 1) % n, qx = b[1 + k2 * 2], qz = b[2 + k2 * 2];
      ar += px * qz - qx * pz; cx += px; cz += pz;
    }
    cx /= n; cz /= n;
    const area = Math.abs(ar) / 2;
    const ci = Math.floor((cx - OG.x0) / OG.cell), cj = Math.floor((cz - OG.z0) / OG.cell);
    const ov = ci >= 0 && cj >= 0 && ci < OG.nx && cj < OG.nz ? OG.a[cj * OG.nx + ci] : 0;
    if (ov === 1 || ov === 2 || ov === 3 || ov === 5) continue; // 도로·물·랜드마크 자리와 겹치면 건너뜀
    const zk = zoneOf(cx, cz);
    const r1 = hrand(i, 1), r2 = hrand(i, 2), r3 = hrand(i, 3);
    const rg = (a0, a1) => a0 + (a1 - a0) * r1;
    let h = b[0], mi = 0, col;
    if (h <= 8) {
      if (zk === 'apt' && area > 350 && area < 1800) { h = rg(38, 72); mi = 1; }
      else if (zk === 'cbd' && area > 400) { h = rg(22, 70); mi = r2 < 0.6 ? 2 : 0; }
      else if (area > 2500) { h = rg(9, 14); mi = zk === 'ind' ? 3 : 0; }
      else { h = Math.max(h, area > 250 ? rg(7, 14) : rg(4, 8)); }
    } else if (h >= 30) { mi = zk === 'apt' || zk === 'mixed' ? 1 : 2; }
    const pk = (arr) => arr[Math.floor(r3 * arr.length) % arr.length];
    col = mi === 1 ? pk(aptColors) : mi === 2 ? pk(officeC) : mi === 3 ? pk(factC) : pk(shopColors);
    // 충돌 상자 (가장 긴 변 방향)
    let bl = 0, ang = 0;
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, dx = b[1 + k2 * 2] - b[1 + k * 2], dz = b[2 + k2 * 2] - b[2 + k * 2], l = Math.hypot(dx, dz); if (l > bl) { bl = l; ang = Math.atan2(dx, dz); } }
    const ux = Math.sin(ang), uz = Math.cos(ang);
    let a0 = Infinity, a1 = -Infinity, l0 = Infinity, l1 = -Infinity;
    for (let k = 0; k < n; k++) { const px = b[1 + k * 2] - cx, pz = b[2 + k * 2] - cz, al = px * ux + pz * uz, la = px * -uz + pz * ux; if (al < a0) a0 = al; if (al > a1) a1 = al; if (la < l0) l0 = la; if (la > l1) l1 = la; }
    const ocx = cx + ux * (a0 + a1) / 2 - uz * (l0 + l1) / 2, ocz = cz + uz * (a0 + a1) / 2 + ux * (l0 + l1) / 2;
    // 외곽 사각형이 도로에 걸치면 (ㄱ자 건물 등) 충돌 상자를 줄이고, 그래도 걸치면 충돌 없음
    let hx = (l1 - l0) / 2, hz = (a1 - a0) / 2, okBox = false;
    for (let t = 0; t < 4 && !okBox; t++) {
      okBox = true;
      if (boxOnRoad(ocx, ocz, hx, hz, ang)) okBox = false;
      if (!okBox) { hx *= 0.82; hz *= 0.82; }
    }
    if (okBox) addOBox(ocx, ocz, hx, hz, ang, 'bld');
    ogMark(ocx, ocz, (l1 - l0) / 2, (a1 - a0) / 2, ang, 4);
    const key = Math.floor(cx / 1000) * 100000 + Math.floor(cz / 1000);
    let c = cellMap.get(key);
    if (!c) { c = { cx: (Math.floor(cx / 1000) + 0.5) * 1000, cz: (Math.floor(cz / 1000) + 0.5) * 1000, items: [], pos: 0, acc: null, done: false }; cellMap.set(key, c); BG.cells.push(c); }
    c.items.push(i, h, mi, col);
    made++;
  }
  W.osmBuildings = made;
  W.bldCells = BG.cells.length;
}
// 한 건물의 벽·지붕을 묶음 배열에 추가
function addBuildingGeo(acc, i, h, mi, colHex) {
  const b = GJ.blds[i], n = (b.length - 1) >> 1;
  const A = acc[mi] || (acc[mi] = { pos: [], nrm: [], uv: [], col: [] });
  const R = acc[4] || (acc[4] = { pos: [], nrm: [], uv: [], col: [] });
  const cr = ((colHex >> 16) & 255) / 255, cg = ((colHex >> 8) & 255) / 255, cb = (colHex & 255) / 255;
  const tw = mi === 2 ? 4 : 8, th = mi === 1 ? 2.9 : mi === 2 ? 4 : 3.2;
  let ar = 0;
  for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; ar += b[1 + k * 2] * b[2 + k2 * 2] - b[1 + k2 * 2] * b[2 + k * 2]; }
  const ccw = ar > 0;
  let per = 0;
  const P = A.pos, N = A.nrm, U = A.uv, C = A.col;
  const v = (x, y, z, u, w, nx, nz) => { P.push(x, y, z); N.push(nx, 0, nz); U.push(u, w); C.push(cr, cg, cb); };
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, px = b[1 + k * 2], pz = b[2 + k * 2], qx = b[1 + k2 * 2], qz = b[2 + k2 * 2];
    const len = Math.hypot(qx - px, qz - pz); if (len < 0.05) continue;
    let nx = (qz - pz) / len, nz = -(qx - px) / len; if (!ccw) { nx = -nx; nz = -nz; }
    const u0 = per / tw, u1 = (per + len) / tw, v1 = h / th; per += len;
    if (ccw) {
      v(px, 0, pz, u0, 0, nx, nz); v(qx, 0, qz, u1, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz);
      v(px, 0, pz, u0, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz); v(px, h, pz, u0, v1, nx, nz);
    } else {
      v(px, 0, pz, u0, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz); v(qx, 0, qz, u1, 0, nx, nz);
      v(px, 0, pz, u0, 0, nx, nz); v(px, h, pz, u0, v1, nx, nz); v(qx, h, qz, u1, v1, nx, nz);
    }
  }
  // 지붕 (귀 자르기)
  const pts = []; for (let k = 0; k < n; k++) pts.push([b[1 + k * 2], b[2 + k * 2]]);
  const ids = earcut2(pts);
  const rr2 = cr * 0.82, rg2 = cg * 0.82, rb2 = cb * 0.82;
  for (let t = 0; t < ids.length; t += 3) for (const id of [ids[t], ids[t + 2], ids[t + 1]]) {
    const q = pts[id]; R.pos.push(q[0], h, q[1]); R.nrm.push(0, 1, 0); R.uv.push(q[0] / 8, q[1] / 8); R.col.push(rr2, rg2, rb2);
  }
}
function finishCell(c) {
  for (let mi = 0; mi < 5; mi++) {
    const g = c.acc[mi]; if (!g || !g.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, BG.mats[mi]); m.castShadow = mi !== 4; m.receiveShadow = true;
    BG.scene.add(m);
  }
  c.acc = null; c.done = true; BG.done++;
}
// 매 프레임 조금씩: 플레이어(또는 카메라)와 가까운 칸부터. 다 만들었으면 true
export function streamBuildings(px, pz, budgetMs = 5) {
  if (!BG.cells.length || BG.done >= BG.cells.length) return true;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    if (!BG.cur) {
      let best = null, bd = Infinity;
      for (const c of BG.cells) { if (c.done) continue; const d = (c.cx - px) ** 2 + (c.cz - pz) ** 2; if (d < bd) { bd = d; best = c; } }
      if (!best) return true;
      BG.cur = best; best.acc = [];
    }
    const c = BG.cur, it = c.items;
    const end = Math.min(it.length, c.pos + 4 * 60);
    for (; c.pos < end; c.pos += 4) addBuildingGeo(c.acc, it[c.pos], it[c.pos + 1], it[c.pos + 2], it[c.pos + 3]);
    if (c.pos >= it.length) { finishCell(c); BG.cur = null; }
  }
  return BG.done >= BG.cells.length;
}
// 특정 위치 근처는 지금 바로 다 만듦 (출발할 때)
export function buildBuildingsNear(px, pz, r = 1200) {
  for (const c of BG.cells) {
    if (c.done || Math.hypot(c.cx - px, c.cz - pz) > r) continue;
    if (BG.cur === c) BG.cur = null;
    c.acc = c.acc || []; for (let k = c.pos; k < c.items.length; k += 4) addBuildingGeo(c.acc, c.items[k], c.items[k + 1], c.items[k + 2], c.items[k + 3]);
    c.pos = c.items.length; finishCell(c);
  }
}
export const buildingProgress = () => (BG.cells.length ? BG.done / BG.cells.length : 1);

export async function buildWorld(scene, progress = () => {}, opts = {}) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  if (!GJ) { progress(0.02, '광주 실제 지도 자료를 받는 중...'); [GJ, GH, GD, GP, GB, GG, GI] = await Promise.all([import('./gjmap.js').then((m) => m.default), import('./gjhwy.js').then((m) => m.default).catch(() => null), import('./hw_daejeon.js').then((m) => m.default).catch(() => null), import('./rp_gwangju.js').then((m) => m.default).catch(() => null), import('./hw_busan.js').then((m) => m.default).catch(() => null), import('./hw_daegu.js').then((m) => m.default).catch(() => null), import('./hw_incheon.js').then((m) => m.default).catch(() => null)]); }
  // 실제 지도(오픈스트리트맵) 데이터가 있으면 그걸로 도로망을 만듦
  if (GJ && GJ.nodes) { buildNetworkOSM(GJ); OG.cell = 5; } else buildNetwork(opts.extraRoads || []);
  // 지도 범위
  if (W.osm) { const b = GJ.bounds; W.bounds = { x0: b[0] - 300, x1: b[1] + 300, z0: b[2] - 300, z1: b[3] + 300 }; }
  else { const c0 = toXZ(35.068, 127.035), c1 = toXZ(35.258, 126.722); W.bounds = { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z) }; }
  const B = W.bounds;
  ogInit(B);
  progress(0.06, '광주 지형을 계산하는 중...');
  await tick();

  // ---------- 동네 성격 ----------
  const ZW = ZONES.map(([k, lat, lon, r]) => ({ k, ...toXZ(lat, lon), r: r * SCALE }));
  const UW = URBAN.map(([lat, lon, r]) => ({ ...toXZ(lat, lon), r: r * SCALE }));
  const zoneOf = (x, z) => {
    let best = null, bd = 1;
    for (const zz of ZW) { const d = Math.hypot(x - zz.x, z - zz.z) / zz.r; if (d < bd) { bd = d; best = zz.k; } }
    if (best) return best;
    return UW.some((u) => Math.hypot(x - u.x, z - u.z) < u.r) ? 'mixed' : 'rural';
  };
  W.zoneOf = zoneOf;

  // ---------- 지형 격자 (산) ----------
  {
    TG.x0 = B.x0; TG.z0 = B.z0; TG.nx = Math.ceil((B.x1 - B.x0) / TG.step) + 1; TG.nz = Math.ceil((B.z1 - B.z0) / TG.step) + 1;
    // 도로까지 거리 (16m 격자, 체임퍼 거리 변환)
    const n = TG.nx * TG.nz, dist = new Float32Array(n).fill(1e6);
    for (const e of W.edges) {
      if (Math.max(e.ya, e.yb) > 0.3 || e.mtn) continue;
      const steps = Math.ceil(e.len / 6);
      for (let k = 0; k <= steps; k++) {
        const x = e.a.x + e.dir.x * (e.len * k / steps), z = e.a.z + e.dir.z * (e.len * k / steps);
        const i = Math.round((x - TG.x0) / TG.step), j = Math.round((z - TG.z0) / TG.step);
        if (i >= 0 && j >= 0 && i < TG.nx && j < TG.nz) dist[j * TG.nx + i] = 0;
      }
    }
    chamfer(dist, TG.nx, TG.nz, TG.step);
    TG.road = dist;
    const MW = MOUNTAINS.map((m) => ({ ...toXZ(m.lat, m.lon), h: m.h, r: m.r * SCALE }));
    // 산마다 자기 범위(√6·r)만 계산 — 전체 격자 × 산 개수로 돌면 몇 초씩 걸림
    const h = new Float32Array(n);
    for (const m of MW) {
      const R = m.r * Math.sqrt(6);
      const i0 = Math.max(0, Math.floor((m.x - R - TG.x0) / TG.step)), i1 = Math.min(TG.nx - 1, Math.ceil((m.x + R - TG.x0) / TG.step));
      const j0 = Math.max(0, Math.floor((m.z - R - TG.z0) / TG.step)), j1 = Math.min(TG.nz - 1, Math.ceil((m.z + R - TG.z0) / TG.step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = TG.x0 + i * TG.step, z = TG.z0 + j * TG.step;
        const d2 = ((x - m.x) ** 2 + (z - m.z) ** 2) / (m.r * m.r);
        if (d2 < 6) { const k = j * TG.nx + i, v = m.h * Math.exp(-d2 * 1.6); if (v > h[k]) h[k] = v; }
      }
    }
    // 산 터널 위에는 능선을 덮음 (실제 산 높이 자료가 없어서 터널 길이에 맞춰 만듦)
    if (W.mtnTunnels && W.mtnTunnels.length) {
      TG.tnx = Math.ceil((B.x1 - B.x0) / 4); TG.tnz = Math.ceil((B.z1 - B.z0) / 4); TG.tun = new Uint8Array(TG.tnx * TG.tnz);
      for (const ch of W.mtnTunnels) {
        const len = ch.reduce((a, e) => a + e.len, 0), H = clamp(len * 0.07, 22, 70), RW = 60 + H;
        for (const e of ch) {
          const i0 = Math.max(0, Math.floor((Math.min(e.a.x, e.b.x) - RW * 1.6 - TG.x0) / TG.step)), i1 = Math.min(TG.nx - 1, Math.ceil((Math.max(e.a.x, e.b.x) + RW * 1.6 - TG.x0) / TG.step));
          const j0 = Math.max(0, Math.floor((Math.min(e.a.z, e.b.z) - RW * 1.6 - TG.z0) / TG.step)), j1 = Math.min(TG.nz - 1, Math.ceil((Math.max(e.a.z, e.b.z) + RW * 1.6 - TG.z0) / TG.step));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const x = TG.x0 + i * TG.step, z = TG.z0 + j * TG.step;
            const d = segDist(x, z, e.a.x, e.a.z, e.b.x, e.b.z);
            const v = H * Math.exp(-((d / RW) ** 2) * 1.4), k = j * TG.nx + i;
            if (v > h[k]) h[k] = v;
          }
          // 터널 안 도로 폭 표시 (4m 칸)
          const steps = Math.ceil(e.len / 2), half = e.hw + 1.2;
          for (let q = 0; q <= steps; q++) for (let l = -half; l <= half; l += 2) {
            const x = e.a.x + e.dir.x * (e.len * q / steps) - e.dir.z * l, z = e.a.z + e.dir.z * (e.len * q / steps) + e.dir.x * l;
            const ti = Math.floor((x - TG.x0) / 4), tj = Math.floor((z - TG.z0) / 4);
            if (ti >= 0 && tj >= 0 && ti < TG.tnx && tj < TG.tnz) TG.tun[tj * TG.tnx + ti] = 1;
          }
        }
      }
    }
    for (let k = 0; k < n; k++) {
      let v = h[k]; if (v <= 0) continue;
      if (v > 0.5) { const i = k % TG.nx, j = (k / TG.nx) | 0; v *= 0.75 + fbm((TG.x0 + i * TG.step) * 0.006 + 2.1, (TG.z0 + j * TG.step) * 0.006 - 1.3) * 0.55; }
      v *= smooth(8, 70, dist[k]);
      h[k] = v < 0.6 ? 0 : v;
    }
    TG.h = h;
  }
  // ---------- 물 격자 ----------
  const riversW = W.osm ? [] : RIVERS.map((r) => ({ name: r.name, hw: r.hw * SCALE, pts: r.pts.map((p) => toXZ(p[0], p[1])) }));
  const lakesW = W.osm ? [] : LAKES.map((l) => ({ ...l, ...toXZ(l.lat, l.lon), rx: l.rx * SCALE, rz: l.rz * SCALE }));
  // 실제 물(강·호수) 다각형
  const waterPolys = W.osm ? GJ.water.map((w) => { const pts = []; for (let i = 1; i < w.length; i += 2) pts.push([w[i], w[i + 1]]); return { cls: w[0], pts }; }) : [];
  W.waterPolys = waterPolys;
  W.rivers = riversW; W.lakes = lakesW;
  {
    TG.wnx = Math.ceil((B.x1 - B.x0) / 8); TG.wnz = Math.ceil((B.z1 - B.z0) / 8);
    TG.water = new Uint8Array(TG.wnx * TG.wnz);
    const markW = (x, z) => { const i = Math.floor((x - TG.x0) / 8), j = Math.floor((z - TG.z0) / 8); if (i >= 0 && j >= 0 && i < TG.wnx && j < TG.wnz) TG.water[j * TG.wnx + i] = 1; };
    for (const r of riversW) for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const ww = r.hw * 0.62;
      for (let s = 0; s <= len; s += 4) for (let l = -ww; l <= ww; l += 4) markW(a.x + dx * s - dz * l, a.z + dz * s + dx * l);
    }
    for (const l of lakesW) {
      const cs = Math.cos(l.rot), sn = Math.sin(l.rot);
      for (let u = -l.rx; u <= l.rx; u += 4) for (let v = -l.rz; v <= l.rz; v += 4) if ((u / l.rx) ** 2 + (v / l.rz) ** 2 < 0.85) markW(l.x + u * cs - v * sn, l.z + u * sn + v * cs);
    }
    for (const w of waterPolys) rasterPoly(w.pts, 8, markW);
  }
  W.curve = null;
  buildRoutesLater();
  progress(0.12, '재질을 준비하는 중...');
  await tick();

  // ---------- 재질 ----------
  const T = makeTextures();
  const mats = W.mats;
  mats.asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.9, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mats.sidewalk = new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.95 });
  mats.grass = new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1, vertexColors: true });
  mats.lawn = new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  mats.concrete = new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9, side: THREE.DoubleSide });
  mats.curb = new THREE.MeshStandardMaterial({ color: 0xb8b8b2, roughness: 0.9 });
  mats.dirt = new THREE.MeshStandardMaterial({ map: T.dirt, roughness: 1 });
  mats.water = new THREE.MeshStandardMaterial({ color: 0x2a6080, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.93, polygonOffset: true, polygonOffsetFactor: -1 });
  mats.white = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mats.yellow = new THREE.MeshStandardMaterial({ color: 0xf2b51a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mats.blue = new THREE.MeshStandardMaterial({ color: 0x2f6be0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mats.metal = new THREE.MeshStandardMaterial({ color: 0x9ea3a8, roughness: 0.4, metalness: 0.7 });
  mats.darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.5, metalness: 0.5 });
  mats.lamp = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffe2a8, emissiveIntensity: 0.0 });
  mats.mountain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  mats.rock = new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 1, flatShading: true });
  mats.tunnelWall = new THREE.MeshStandardMaterial({ color: 0xc9c4b4, roughness: 0.8 });
  mats.tunnelLamp = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb54a, emissiveIntensity: 1.2 });
  mats.vinyl = new THREE.MeshStandardMaterial({ color: 0xeef3f2, roughness: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  mats.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  mats.basic = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  mats.glassWall = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x7fa6c2, roughness: 0.08, metalness: 0.6 });
  mats.field = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  const bmat = (k, rough, metal) => {
    const m = new THREE.MeshStandardMaterial({ map: T[k], emissiveMap: T[k + 'N'], emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: rough, metalness: metal });
    W.buildingMats.push(m); return m;
  };
  mats.office = bmat('office', 0.25, 0.5);
  mats.apt = bmat('apt', 0.8, 0.05);
  mats.shop = bmat('shop', 0.8, 0.05);
  mats.factory = bmat('factory', 0.6, 0.3);
  mats.arrows = {};
  for (const k in T.arrows) mats.arrows[k] = new THREE.MeshStandardMaterial({ map: T.arrows[k], transparent: true, alphaTest: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mats.busText = new THREE.MeshStandardMaterial({ map: T.busText, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mats.bump = new THREE.MeshStandardMaterial({ map: T.bump, roughness: 0.7 });

  let tris = new Tris(400);
  let stat = new Merger({ tile: 400 });
  const bld = new Merger({ tile: 400 });
  let marks = { white: new Inst(FLAT, mats.white), yellow: new Inst(FLAT, mats.yellow), blue: new Inst(FLAT, mats.blue) };
  let arrowsI = {}; for (const k in mats.arrows) arrowsI[k] = new Inst(FLAT, mats.arrows[k]);
  let busTextI = new Inst(FLAT, mats.busText);
  const trees = [], pines = [];
  let poles = new Inst(GEO.cyl8, mats.darkMetal);
  let lampArms = new Inst(GEO.box, mats.darkMetal);
  let lampHeads = new Inst(GEO.box, mats.lamp);
  let signPoles = new Inst(GEO.cyl8, mats.metal);
  let speedSigns = {}; for (const v in T.speed) speedSigns[v] = new Inst(new THREE.CircleGeometry(0.42, 20), new THREE.MeshStandardMaterial({ map: T.speed[v], roughness: 0.6 }));
  let boxes = new Inst(GEO.box, mats.basic);
  // 그림이 들어갈 곳 (멀리 있는 지역은 칸마다 묶음을 따로 만들어 붙였다 뗌)
  let SINK = scene, NOCOL = false;
  const addOB = (...a) => (NOCOL ? {} : addOBox(...a));
  const addCi = (...a) => (NOCOL ? {} : addCircle(...a));

  const mark = (color, x, z, ry, w, l, y = ROADY + 0.012, rx = 0) => marks[color].add(x, y, z, ry, w, 1, l, undefined, rx);
  // 회전 상자: 중심 (x,z), 방향 ry, 폭 w(옆), 길이 l(진행), 높이 y0~y1
  const obox = (M, mat, x, z, ry, w, l, y0, y1, col, rx = 0) => M.add(GEO.box, mat, mx(x, (y0 + y1) / 2, z, rx, ry, 0, w, y1 - y0, l), col);
  const box = (M, mat, x0, y0, z0, x1, y1, z1, col) => M.add(GEO.box, mat, mx((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), col);
  const plane = (M, mat, x0, z0, x1, z1, y) => M.add(GEO.plane, mat, mx((x0 + x1) / 2, y, (z0 + z1) / 2, -Math.PI / 2, 0, 0, Math.abs(x1 - x0), Math.abs(z1 - z0), 1));
  const label = (lines, opt, x, y, z, ry, w, h, double) => {
    const tex = textBoard(lines, opt);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: double ? THREE.DoubleSide : THREE.FrontSide });
    const sm = new THREE.Mesh(GEO.plane, m); sm.scale.set(w, h, 1); sm.position.set(x, y, z); sm.rotation.y = ry; sm.userData.own = true; SINK.add(sm);
    return sm;
  };
  // 링크/엣지 좌표계 점
  const EP = (e, s, lat) => ({ x: e.a.x + e.dir.x * s - e.dir.z * lat, z: e.a.z + e.dir.z * s + e.dir.x * lat });
  const LP = (L, s, lat) => ({ x: L.from.x + L.dir.x * s + L.right.x * lat, z: L.from.z + L.dir.z * s + L.right.z * lat });
  // 엣지 띠 (s0~s1, lat0~lat1, 높이 y0~y1 선형)
  const strip = (mat, e, s0, s1, l0, l1, dy = 0, col) => {
    const p = (s, l) => { const q = EP(e, s, l); return [q.x, edgeY(e, s) + dy, q.z]; };
    tris.quad(mat, p(s0, l0), p(s0, l1), p(s1, l1), p(s1, l0), col);
  };

  // ---------- 땅 (구역별 색) ----------
  {
    const step = 64;
    const nx = Math.ceil((B.x1 - B.x0) / step), nz = Math.ceil((B.z1 - B.z0) / step);
    const g = new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0, nx, nz);
    g.rotateX(-Math.PI / 2); g.translate((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      uv.setXY(i, x / 10, z / 10);
      const k = zoneOf(x, z), n = fbm(x * 0.01, z * 0.01);
      if (k === 'rural') c.setRGB(0.78 + n * 0.25, 0.86 + n * 0.2, 0.42 + n * 0.1);
      else if (k === 'park' || k === 'campus') c.setRGB(0.85, 1.0, 0.8);
      else if (k === 'ind') c.setRGB(0.82, 0.8, 0.72);
      else c.setRGB(0.74 + n * 0.1, 0.78 + n * 0.1, 0.66);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    W.groundGeo = g;
  }
  progress(0.18, '무등산과 강을 만드는 중...');
  await tick();

  // ---------- 산 지형 (높이가 있는 타일만) ----------
  {
    const TILE = 32; // 격자 칸 수 (16m × 32 = 512m)
    for (let tj = 0; tj < TG.nz - 1; tj += TILE) for (let ti = 0; ti < TG.nx - 1; ti += TILE) {
      const ni = Math.min(TILE, TG.nx - 1 - ti), nj = Math.min(TILE, TG.nz - 1 - tj);
      let mxh = 0;
      for (let j = tj; j <= tj + nj; j++) for (let i = ti; i <= ti + ni; i++) mxh = Math.max(mxh, TG.h[j * TG.nx + i]);
      if (mxh < 0.8) continue;
      const g = new THREE.PlaneGeometry(ni * TG.step, nj * TG.step, ni, nj);
      g.rotateX(-Math.PI / 2);
      g.translate(TG.x0 + (ti + ni / 2) * TG.step, 0, TG.z0 + (tj + nj / 2) * TG.step);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), hh = terrainH(x, z);
        pos.setY(i, hh > 0.05 ? hh : -0.08);
        const n = fbm(x * 0.03, z * 0.03);
        if (hh > 220) c.setRGB(0.5 + n * 0.1, 0.48 + n * 0.1, 0.42 + n * 0.1);
        else if (hh > 0.05) c.setRGB(0.2 + n * 0.12, 0.36 + n * 0.14 - hh * 0.0005, 0.16 + n * 0.06);
        else c.setRGB(0.42, 0.5, 0.34);
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats.mountain); m.receiveShadow = true; scene.add(m);
    }
    for (let k = 0; k < 9000; k++) {
      const x = rr(B.x0, B.x1), z = rr(B.z0, B.z1);
      const hh = terrainH(x, z);
      if (hh < 3 || hh > 230) continue;
      pines.push([x, hh - 0.3, z, rr(0.8, 1.5)]);
    }
  }
  // ---------- 강 · 호수 ----------
  {
    for (const r of riversW) {
      const L = r.pts;
      const side = (i, f) => {
        const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        return { x: L[i].x - dz * f, z: L[i].z + dx * f };
      };
      for (let i = 0; i < L.length - 1; i++) {
        const w0 = r.hw * 0.62;
        const a1 = side(i, -w0), a2 = side(i, w0), b1 = side(i + 1, -w0), b2 = side(i + 1, w0);
        tris.quad(mats.water, [a1.x, 0.035, a1.z], [a2.x, 0.035, a2.z], [b2.x, 0.035, b2.z], [b1.x, 0.035, b1.z]);
        // 둔치 (강변 풀밭) 와 제방길
        for (const sg of [1, -1]) {
          const p0 = side(i, sg * w0), p1 = side(i, sg * r.hw), q0 = side(i + 1, sg * w0), q1 = side(i + 1, sg * r.hw);
          tris.quad(mats.lawn, [p0.x, 0.025, p0.z], [p1.x, 0.025, p1.z], [q1.x, 0.025, q1.z], [q0.x, 0.025, q0.z]);
          if (r.hw > 20) for (let t = 0; t < 1; t += 0.12) { const tx = p1.x + (q1.x - p1.x) * t, tz = p1.z + (q1.z - p1.z) * t; if (R() < 0.6) trees.push([tx, 0.03, tz, rr(0.7, 1.1)]); }
        }
        ogSeg(L[i].x, L[i].z, L[i + 1].x, L[i + 1].z, r.hw + 3, 2);
      }
      const mid = L[Math.floor(L.length / 2)];
      W.landmarks.push({ name: r.name, x: mid.x, z: mid.z, r: 60, river: true });
    }
    for (const l of lakesW) {
      const pts = [];
      for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; const u = Math.cos(a) * l.rx, v = Math.sin(a) * l.rz; pts.push([l.x + u * Math.cos(l.rot) - v * Math.sin(l.rot), 0.04, l.z + u * Math.sin(l.rot) + v * Math.cos(l.rot)]); }
      tris.poly(mats.water, pts);
      ogMark(l.x, l.z, l.rx + 6, l.rz + 6, Math.PI / 2 - l.rot, 2);
    }
    for (const w of waterPolys) {
      tris.flat(mats.water, w.pts, 0.035);
      rasterPoly(w.pts, OG.cell, (x, z) => { const i = Math.floor((x - OG.x0) / OG.cell), j = Math.floor((z - OG.z0) / OG.cell); if (i >= 0 && j >= 0 && i < OG.nx && j < OG.nz && !OG.a[j * OG.nx + i]) OG.a[j * OG.nx + i] = 2; });
    }
  }
  progress(0.26, '도로와 차선을 그리는 중...');
  await tick();

  // ---------- 도로 ----------
  const walkKinds = ['city', 'alley', 'industrial'];
  // 보도 폭: 실제 지도에선 골목은 보도 없음, 작은 길은 좁게
  const swOf = (e) => (!walkKinds.includes(e.kind) || e.ramp || e.elevated ? 0 : !W.osm ? SIDEWALK : e.kind === 'alley' ? 0 : e.osm >= 4 ? 2.2 : 3.2);
  W.swOf = swOf;
  W.mini.roads = [];
  // 지하차도(땅 밑으로 내려가는 길): 땅을 그 자리만 안 그리도록 스텐실 마스크를 만들고 옹벽을 세움
  const maskPos = [];
  const sunkenEdge = (e) => {
    const ya = e.ya, yb = e.yb, len = e.len;
    const sAt = (yy) => (len * (yy - ya)) / (yb - ya || 1e-6);
    let a0 = 0, a1 = len;
    if (ya > -0.3) a0 = clamp(sAt(-0.3), 0, len);
    if (yb > -0.3) a1 = clamp(sAt(-0.3), 0, len);
    if (a1 - a0 < 1) return;
    const W2 = e.hw + 0.75;
    // 마스크 (땅 구멍)
    const m = (s2, l) => { const q = EP(e, s2, l); return [q.x, 0.012, q.z]; };
    const A = m(a0 - 0.5, -W2), B = m(a0 - 0.5, W2), C2 = m(a1 + 0.5, W2), D = m(a1 + 0.5, -W2);
    maskPos.push(...A, ...B, ...C2, ...A, ...C2, ...D);
    for (let ss = a0; ss < a1 - 0.2; ss += 6) {
      const ee = Math.min(a1, ss + 6), mm = (ss + ee) / 2, seg = ee - ss;
      const c = EP(e, mm, 0);
      const covered = onAnyRoad(c.x, c.z, e, 0.6, false);
      const yLo = Math.min(edgeY(e, ss), edgeY(e, ee)) - 0.4;
      if (covered) obox(stat, mats.concrete, c.x, c.z, e.heading, 2 * (e.hw + 0.95), seg + 0.1, -1.15, -0.04);
      for (const sg of [1, -1]) {
        const q = EP(e, mm, sg * (e.hw + 0.45));
        // 다른 (같은 높이) 길과 합쳐지는 곳은 벽을 비움
        const qa = EP(e, ss, sg * (e.hw + 0.45)), qb = EP(e, ee, sg * (e.hw + 0.45)), ym2 = edgeY(e, mm);
        if (onAnyRoad(q.x, q.z, e, 0.25, true, ym2) || onAnyRoad(qa.x, qa.z, e, 0.25, true, ym2) || onAnyRoad(qb.x, qb.z, e, 0.25, true, ym2)) continue;
        obox(stat, mats.concrete, q.x, q.z, e.heading, 0.5, seg + 0.05, yLo, covered ? -1.15 : 0.95);
        const k = addOB(q.x, q.z, 0.3, seg / 2, e.heading, 'barrier'); k.lvl = 'hwy'; k.eid = e.id; k.y = edgeY(e, mm);
      }
    }
  };
  // 고속도로 가운데 방호벽: 8m 마다 반대 방향 짝 길을 찾아 두 길 사이 가운데에 세움
  const hwyBarrier = (e, s0, s1) => {
    let run = null;
    const flush = () => {
      if (run && run.b - run.a >= 6) {
        const lm = run.l / run.k, c = EP(e, (run.a + run.b) / 2, lm);
        obox(stat, mats.concrete, c.x, c.z, e.heading, 0.5, run.b - run.a, 0, 0.95);
        addOB(c.x, c.z, 0.25, (run.b - run.a) / 2, e.heading, 'median');
      }
      run = null;
    };
    for (let ss = s0 + 2; ss < s1 - 2; ss += 8) {
      const se = Math.min(ss + 8, s1 - 2), sm = (ss + se) / 2;
      const p = EP(e, sm, -e.gap / 2);
      let best = null, bl = 1e9;
      for (const o of edgesNear(p.x, p.z)) {
        if (o === e || o.name !== e.name || o.elevated || o.dir.x * e.dir.x + o.dir.z * e.dir.z > -0.9) continue;
        const q = EP(e, sm, 0), s2 = (q.x - o.a.x) * o.dir.x + (q.z - o.a.z) * o.dir.z;
        if (s2 < -2 || s2 > o.len + 2) continue;
        const lat = (q.x - o.a.x) * -o.dir.z + (q.z - o.a.z) * o.dir.x; // 짝 길 기준 옆 거리
        const d = Math.abs(lat);
        if (d > 3 && d < 30 && d < bl) { bl = d; best = o; }
      }
      // 다른 길(연결로 등)이 지나가는 곳은 비움
      let blocked = !best;
      if (best) {
        const lm = -(bl + e.hw - best.hw) / 2, c = EP(e, sm, lm);
        for (const o of edgesNear(c.x, c.z)) {
          if (o === e || o === best || o.elevated) continue;
          const s3 = (c.x - o.a.x) * o.dir.x + (c.z - o.a.z) * o.dir.z;
          if (s3 < -1 || s3 > o.len + 1) continue;
          if (Math.abs((c.x - o.a.x) * -o.dir.z + (c.z - o.a.z) * o.dir.x) < o.hw + 0.4) { blocked = true; break; }
        }
        if (!blocked) {
          if (run && Math.abs(run.l / run.k - lm) < 0.6 && ss <= run.b + 0.1) { run.b = se; run.l += lm; run.k++; }
          else { flush(); run = { a: ss, b: se, l: lm, k: 1 }; }
          continue;
        }
      }
      flush();
    }
    flush();
  };
  // 큰 교차로 (분리 도로끼리 만나 교차점이 여러 개): 교차점 사이 빈 땅까지 한 판으로 포장 — 무리는 한 번만 계산
  const computeBigJ = (NODES, EDGES) => {
    const ground = (n) => n.y < 0.5 && n.items && n.items.length >= 3 && !n.edges.some((e) => e.elevated && Math.max(e.ya, e.yb) > 0.5);
    const par = new Map();
    const find = (n) => { let r = n; while (par.get(r) !== r) r = par.get(r); par.set(n, r); return r; };
    for (const n of NODES) if (ground(n)) par.set(n, n);
    for (const e of EDGES) {
      if (e.len > 45 || e.elevated || e.ramp || e.osm > 4 || !par.has(e.a) || !par.has(e.b)) continue;
      const ra = find(e.a), rb = find(e.b); if (ra !== rb) par.set(ra, rb);
    }
    const groups = new Map();
    for (const n of par.keys()) { const r = find(n); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(n); }
    let filled = 0;
    for (const g of groups.values()) {
      if (g.length < 2 || g.length > 12) continue;
      const set = new Set(g), pts = [];
      for (const n of g) for (const it of n.items) {
        const e = it.e, c = n.clear.get(e), fromA = e.a === n, sA = fromA ? c : e.len - c;
        const inner = set.has(e.a) && set.has(e.b);
        for (const l of [-e.hw, e.hw]) { const q = EP(e, sA, l); pts.push([q.x, ROADY - 0.004, q.z]); }
        if (inner) for (const l of [-e.hw, e.hw]) { const q = EP(e, fromA ? e.len - c : c, l); pts.push([q.x, ROADY - 0.004, q.z]); }
      }
      const hl = hull(pts);
      let ar = 0, dmax = 0;
      for (let i = 0; i < hl.length; i++) { const a = hl[i], b = hl[(i + 1) % hl.length]; ar += a[0] * b[2] - b[0] * a[2]; for (const c of hl) dmax = Math.max(dmax, Math.hypot(a[0] - c[0], a[2] - c[2])); }
      if (Math.abs(ar) / 2 > 6000 || dmax > 110) continue;
      g.hl = hl;
      for (const n of g) n.bigJ = g;
      filled++;
    }
    W.bigJunctions = (W.bigJunctions || 0) + filled;
  };
  W.computeBigJ = computeBigJ;
  const drawRoads = (EDGES, NODES, LINKS, cell) => {
  const out = { trees: [] };
  for (const n of NODES) if (n.bigJ && n.bigJ[0] === n && n.bigJ.hl) tris.poly(mats.asphalt, n.bigJ.hl);
(() => {   for (const e of EDGES) {
    const s0 = e.ca, s1 = e.len - e.cb;
    if (!cell) W.mini.roads.push({ ax: e.a.x, az: e.a.z, bx: e.b.x, bz: e.b.z, w: e.hw * 2, kind: e.kind, up: e.elevated || e.ramp, name: e.name });
    if (s1 - s0 > 0.05) strip(mats.asphalt, e, s0, s1, -e.hw, e.hw, ROADY);
    // 어린이 보호구역: 양 끝 빨간 노면 + 표지판
    if (e.schoolZone && s1 - s0 > 6) {
      const SZ = schoolZoneMats(), ln = Math.min(18, (s1 - s0) / 2);
      strip(SZ.red, e, s0, s0 + ln, -e.hw + 0.3, e.hw - 0.3, ROADY + 0.006);
      strip(SZ.red, e, s1 - ln, s1, -e.hw + 0.3, e.hw - 0.3, ROADY + 0.006);
      if (s1 - s0 > 40) for (const [ss, sg, ry] of [[s0 + 5, 1, e.heading + Math.PI], [s1 - 5, -1, e.heading]]) {
        const q = EP(e, ss, sg * (e.hw + 1.1));
        signPoles.add(q.x, 1.5, q.z, 0, 0.05, 3, 0.05);
        stat.add(GEO.plane, SZ.sign, mx(q.x, 2.75, q.z, 0, ry, 0, 0.95, 1.15, 1));
      }
    }
    // 점유: 도로 + 보도
    ogSeg(e.a.x, e.a.z, e.b.x, e.b.z, e.hw + (swOf(e) ? swOf(e) + 0.6 : W.osm ? 0.8 : 3), e.elevated ? 3 : 1);
    // 보도 (분리 도로의 안쪽 = 중앙 화단 쪽은 보도 없음)
    if (swOf(e) > 0 && s1 - s0 > 1) {
      for (const sg of e.oneway && e.gap ? [1] : [1, -1]) {
        const c = EP(e, (s0 + s1) / 2, sg * (e.hw + swOf(e) / 2));
        obox(stat, mats.sidewalk, c.x, c.z, e.heading, swOf(e), s1 - s0, 0, 0.15);
        if (!cell && e.kind !== 'alley') W.walks.push({ e, side: sg, s0, s1 });
        // 다른 지역 칸: 가로수 (광주는 따로 심음)
        if (cell && e.kind === 'city' && e.osm <= 3 && s1 - s0 > 14) for (let ss = s0 + 6; ss < s1 - 6; ss += 10) { const q = EP(e, ss, sg * (e.hw + swOf(e) - 0.8)); out.trees.push(q.x, q.z); }
      }
    }
    // 나들목이 붙은 고가 교차점 근처는 벽·분리대를 비움 (연결로로 드나들 수 있게)
    const rampAt = (n) => !W.osm && n.edges.some((x) => x.ramp) && n.y > 1;
    const gapA = e.elevated && rampAt(e.a) ? 70 : 0, gapB = e.elevated && rampAt(e.b) ? 70 : 0;
    // 중앙분리대 (다른 길과 겹치는 구간은 비움 — 연결로 · 합류 차로를 막지 않게)
    if (e.median >= 1 && s1 - s0 > 14 + gapA + gapB && !e.ramp) {
      const pitch = -Math.atan2(e.yb - e.ya, e.len);
      for (const [m0, m1] of freeRanges(e, s0 + 6 + gapA, s1 - 6 - gapB, 0, e.median / 2 + 0.3)) {
        if (m1 - m0 < 4) continue;
        const c = EP(e, (m0 + m1) / 2, 0);
        const y0 = edgeY(e, (m0 + m1) / 2);
        obox(stat, mats.concrete, c.x, c.z, e.heading, e.median - 0.7, m1 - m0, y0 + ROADY, y0 + ROADY + (e.kind === 'highway' ? 0.95 : 0.7), undefined, pitch);
        const k = addOB(c.x, c.z, (e.median - 0.6) / 2, (m1 - m0) / 2, e.heading, 'median'); if (e.elevated) { k.lvl = 'hwy'; k.y = y0; }
        if (e.kind === 'city') obox(stat, mats.yellow, c.x, c.z, e.heading, 0.12, m1 - m0, y0 + 0.7, y0 + 1.3);
      }
    }
    // 분리 도로 사이 중앙 화단 (같은 이름 반대 방향 길과의 틈) — 다른 길과 겹치는 구간은 비움
    if (e.oneway && e.gap && !e.elevated && !e.ramp && !e.sunken && s1 - s0 > 8 && !(e.a.bigJ && e.a.bigJ === e.b.bigJ)) {
      const iw = e.gap / 2 - e.hw;
      // 고속도로 · 자동차전용도로: 두 방향 길 사이 한가운데에 콘크리트 방호벽 (한쪽 길에서만 세움)
      if (e.kind === 'highway' || e.osm <= 1) {
        if (e.dir.x > 1e-6 || (Math.abs(e.dir.x) <= 1e-6 && e.dir.z > 0)) hwyBarrier(e, s0, s1);
      }
      else if (iw > 0.25) {
        for (const [m0, m1] of freeRanges(e, s0 + 1, s1 - 1, -(e.hw + iw / 2), iw / 2 + 0.3)) {
          if (m1 - m0 < 4) continue;
          const c = EP(e, (m0 + m1) / 2, -(e.hw + iw / 2));
          obox(stat, mats.concrete, c.x, c.z, e.heading, iw + 0.02, m1 - m0, 0, 0.2);
          if (iw > 1.1 && m1 - m0 > 6) obox(stat, mats.basic, c.x, c.z, e.heading, Math.max(0.4, iw * 2 - 1.2), m1 - m0 - 2, 0.2, 0.75, 0x3f7a35);
          if (m1 - m0 > 10) addOB(c.x, c.z, Math.max(0.2, iw / 2), (m1 - m0) / 2 - 1, e.heading, 'median');
        }
      }
    }
    // 지하차도: 옹벽 · 위를 지나는 도로 밑 슬래브
    if (e.sunken) sunkenEdge(e);
    // 고가 구조물 · 방호벽
    else if (e.elevated || e.ramp) {
      const ya = e.ya, yb = e.yb;
      // 상판
      if (Math.max(ya, yb) > 0.8) {
        const sA = ya > 0.8 ? 0 : e.len * (0.8 - ya) / (yb - ya), sB = yb > 0.8 ? e.len : e.len * (0.8 - ya) / (yb - ya);
        const p = (s, l, dy) => { const q = EP(e, s, l); return [q.x, edgeY(e, s) + dy, q.z]; };
        const a0 = Math.min(sA, sB), a1 = Math.max(sA, sB);
        for (const sg of [1, -1]) tris.quad(mats.concrete, p(a0, sg * (e.hw + 0.6), -1.2), p(a1, sg * (e.hw + 0.6), -1.2), p(a1, sg * (e.hw + 0.6), ROADY), p(a0, sg * (e.hw + 0.6), ROADY));
        tris.quad(mats.concrete, p(a0, -e.hw - 0.6, -1.2), p(a0, e.hw + 0.6, -1.2), p(a1, e.hw + 0.6, -1.2), p(a1, -e.hw - 0.6, -1.2));
        // 교각 (지상 도로 위는 피함)
        for (let s = a0 + 12; s < a1 - 6; s += 42) {
          const y = edgeY(e, s); if (y < 2) continue;
          const q = EP(e, s, 0);
          const onRoad = rInfo(q.x, q.z, 'surface');
          if (onRoad && onRoad.kind !== 'off') continue;
          obox(stat, mats.concrete, q.x, q.z, e.heading, Math.min(e.hw * 1.1, 8), 2.2, 0, y - 1.1);
          if (!onAnyRoad(q.x, q.z, e, 1.5)) addOB(q.x, q.z, Math.min(e.hw * 0.55, 4), 1.1, e.heading, 'pier');
        }
      }
      // 방호벽 (양쪽) — 연결로는 높은 부분만, 고가는 나들목 근처를 비움
      let b0 = 1 + gapA, b1 = e.len - 1 - gapB;
      if (e.ramp) { const up = (s2) => edgeY(e, s2) > 1.2; const sLow = ya < yb ? e.len * (1.2 - ya) / (yb - ya) : e.len * (ya - 1.2) / (ya - yb); if (ya < yb) b0 = Math.max(b0, sLow); else b1 = Math.min(b1, sLow); b1 = Math.min(b1, e.len - (yb > 1 ? 60 : 1)); b0 = Math.max(b0, ya > 1 ? 60 : 1); void up; }
      for (const sg of [1, -1]) {
        let c0 = b0, c1 = b1;
        const hit = (ss) => { const q = EP(e, ss, sg * (e.hw + 0.3)); return onAnyRoad(q.x, q.z, e, 0.2, true, edgeY(e, ss)); };
        while (c0 < c1 && hit(c0)) c0 += 2;
        while (c1 > c0 && hit(c1)) c1 -= 2;
        if (c1 - c0 <= 4) continue;
        const sm = (c0 + c1) / 2, q = EP(e, sm, sg * (e.hw + 0.3)), ym = edgeY(e, sm);
        const pitch = -Math.atan2(yb - ya, e.len);
        obox(stat, mats.concrete, q.x, q.z, e.heading, 0.5, c1 - c0, ym + ROADY, ym + ROADY + 1.0, undefined, pitch);
        const k = addOB(q.x, q.z, 0.35, (c1 - c0) / 2, e.heading, 'barrier'); k.lvl = 'hwy'; k.eid = e.id; k.y = ym;
      }
    }
    // 가드레일 (산길·호숫길)
    if (e.kind === 'coast' || e.kind === 'mountain') {
      for (const sg of e.kind === 'coast' ? [1] : [1, -1]) {
        const q = EP(e, e.len / 2, sg * (e.hw + 0.4));
        obox(stat, mats.metal, q.x, q.z, e.heading, 0.12, e.len - 1, 0.45, 0.8);
      }
    }
  } })();
  // 교차로 바닥 · 굽은 곳 보도 이음
(() => {   for (const n of NODES) {
    const pts = [], walkL = [], walkR = [];
    for (const it of n.items) {
      const e = it.e, c = n.clear.get(e);
      const fromA = e.a === n, s = fromA ? c : e.len - c;
      const y = n.y + ROADY;
      for (const l of [-e.hw, e.hw]) { const q = EP(e, s, l); pts.push([q.x, y, q.z]); }
      if (n.items.length === 2 && swOf(e) > 0) {
        for (const l of [e.hw, e.hw + swOf(e)]) { const q = EP(e, s, l); walkL.push([q.x, 0.15, q.z]); }
        for (const l of [-e.hw, -e.hw - swOf(e)]) { const q = EP(e, s, l); walkR.push([q.x, 0.15, q.z]); }
      }
    }
    if (pts.length >= 3) tris.poly(mats.asphalt, hull(pts));
    if (n.items.length === 2 && walkL.length === 4) {
      // 두 도로가 같은 쪽 보도: a 의 +쪽은 b 의 -쪽 (진행방향 반대)
      const swap = (arr) => arr;
      const sideA = [walkL[0], walkL[1], walkR[2], walkR[3]], sideB = [walkR[0], walkR[1], walkL[2], walkL[3]];
      const ok = (q) => Math.hypot(q[0][0] - q[2][0], q[0][2] - q[2][2]) < 30;
      for (const q of [sideA, sideB]) if (ok(q)) tris.poly(mats.sidewalk, hull(swap(q)));
    }
    ogMark(n.x, n.z, n.r + (W.osm ? 1 : 4), n.r + (W.osm ? 1 : 4), 0, n.y > 1 ? 3 : 1);
  } })();
  if (maskPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(maskPos, 3)); maskPos.length = 0;
    const mm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    const mesh = new THREE.Mesh(g, mm); mesh.renderOrder = -10; SINK.add(mesh);
    // 땅은 마스크 자리(스텐실 1)에선 안 그림
    for (const gm of [mats.grass]) Object.assign(gm, { stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
    if (!cell) W.underpassMask = mesh;
  }
  // 산 터널: 벽 · 천장 · 조명 · 입구
  if (!cell && W.mtnTunnels && W.mtnTunnels.length) {
    const tl = new Inst(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    for (const ch of W.mtnTunnels) {
      const set = new Set(ch);
      for (const e of ch) {
        const H = 6.6, c = EP(e, e.len / 2, 0);
        for (const sg of [1, -1]) {
          const q = EP(e, e.len / 2, sg * (e.hw + 0.45));
          obox(stat, mats.concrete, q.x, q.z, e.heading, 0.6, e.len + 0.3, -0.2, H);
          addOB(q.x, q.z, 0.3, e.len / 2 + 0.1, e.heading, 'tunnel');
          for (let ss = 4; ss < e.len; ss += 12) { const r = EP(e, ss, sg * (e.hw - 0.2)); tl.add(r.x, H - 0.5, r.z, e.heading, 0.25, 0.12, 2.2); }
        }
        obox(stat, mats.concrete, c.x, c.z, e.heading, 2 * (e.hw + 0.9), e.len + 0.3, H, H + 0.8);
        // 입구 (다른 길로 이어지는 끝)
        for (const [n, s0, dirS] of [[e.a, 0, -1], [e.b, e.len, 1]]) {
          if (n.edges.some((o) => o !== e && set.has(o))) continue;
          const w = e.hw + 0.9;
          for (const sg of [1, -1]) { const q = EP(e, s0 + dirS * 0.6, sg * (w + 1.4)); obox(stat, mats.concrete, q.x, q.z, e.heading, 2.8, 1.6, -0.2, H + 3.4); }
          const q = EP(e, s0 + dirS * 0.6, 0); obox(stat, mats.concrete, q.x, q.z, e.heading, 2 * (w + 2.8), 1.6, H, H + 3.4);
          obox(stat, mats.yellow, q.x, q.z, e.heading, 2 * w, 1.7, H - 0.25, H);
        }
      }
    }
    tl.build(scene, { far: 900 });
  }

  // ---------- 차선 · 표지 · 가로등 ----------
(() => {   for (const L of LINKS) {
    const e = L.edge;
    const yS = (s) => linkY(L, s) + ROADY + 0.012;
    const pitch = -Math.atan2(L.y1 - L.y0, L.len);
    const seg = (color, a, b, lat, w) => { if (b - a < 0.2) return; const p = LP(L, (a + b) / 2, lat); mark(color, p.x, p.z, L.heading, w, b - a, yS((a + b) / 2), pitch); };
    const dashed = (color, a, b, lat, w, dash, gap) => { for (let s = a; s + dash <= b; s += dash + gap) seg(color, s, s + dash, lat, w); };
    const sA = L.s0 + 1, sEnd = L.to.signal ? L.stopS : L.s1 - 1;
    const solidFrom = L.to.signal ? sEnd - 30 : sEnd;
    if (L.s1 - L.s0 < 3) continue;
    // 중앙선 (한쪽에서만)
    if (e.oneway || !e.bwd) {
      // 일방통행(분리 도로 한쪽): 왼쪽 끝 노란 실선 하나 (가운데에 중앙선을 긋지 않음)
      if (!e.ramp && e.kind !== 'ic') seg('yellow', sA, L.s1 - 1, L.median / 2 + 0.2, 0.15);
    } else if (L.from === e.a) {
      if (e.median >= 1) { seg('yellow', sA, L.s1 - 1, e.median / 2 - 0.15, 0.15); seg('yellow', sA, L.s1 - 1, -(e.median / 2 - 0.15), 0.15); }
      else if (e.dashedCenter || e.kind === 'alley') dashed('yellow', sA, L.s1 - 1, 0, 0.15, 4, 6);
      else if (e.kind === 'mountain' || e.kind === 'ic') seg('yellow', sA, L.s1 - 1, 0, 0.15);
      else { seg('yellow', sA, L.s1 - 1, 0.13, 0.13); seg('yellow', sA, L.s1 - 1, -0.13, 0.13); }
    }
    const hwy = e.kind === 'highway';
    for (let k = 1; k < L.n; k++) {
      const lat = L.median / 2 + k * LANE_W;
      const col = L.bus && k === L.n - 1 ? 'blue' : 'white';
      dashed(col, sA, solidFrom, lat, 0.15, hwy ? 8 : 3, hwy ? 12 : 5); seg(col, solidFrom, sEnd, lat, 0.15);
    }
    if (['highway', 'mountain', 'coast', 'rural', 'ic', 'industrial'].includes(e.kind)) seg('white', sA, L.s1 - 1, L.median / 2 + L.n * LANE_W + 0.12, 0.15);
    else if (e.kind === 'city' && L.n >= 2 && !e.elevated) seg('yellow', sA, L.s1 - 1, L.median / 2 + L.n * LANE_W - 0.2, 0.13);
    if (L.bus) for (let s = sA + 30; s < sEnd - 50; s += 90) { const p = LP(L, s, laneOff(L, L.n - 1)); busTextI.add(p.x, yS(s), p.z, L.heading + Math.PI, 1.3, 1, 3.3); }
    // 정지선 · 횡단보도 · 화살표
    if (L.to.signal) {
      const p = LP(L, L.stopS, L.median / 2 + (L.n * LANE_W) / 2);
      mark('white', p.x, p.z, L.heading, L.n * LANE_W, 0.45, yS(L.stopS));
      for (let lat = -e.hw + 0.6; lat < e.hw - 0.2; lat += 1.0) { const q = LP(L, L.s1 - 2.6, lat); mark('white', q.x, q.z, L.heading, 0.5, 3.6, yS(L.s1)); }
      for (let k = 0; k < L.n; k++) {
        let t = 'S';
        if (L.n === 1) t = 'SLR';
        else if (k === 0) t = L.median >= 1 ? 'L' : 'SL';
        else if (k === L.n - 1) t = 'SR';
        for (const back of [10, 45]) {
          if (L.stopS - back < L.s0 + 8) continue;
          const q = LP(L, L.stopS - back, laneOff(L, k));
          arrowsI[t].add(q.x, yS(L.stopS - back), q.z, L.heading + Math.PI, 1.2, 1, 3.6);
        }
      }
    }
    if (L.rail) { const p = LP(L, L.rail.stopS, L.median / 2 + (L.n * LANE_W) / 2); mark('white', p.x, p.z, L.heading, L.n * LANE_W, 0.45); }
    // 가로등
    if (e.kind !== 'mountain' && e.kind !== 'alley' && L.s1 - L.s0 > 20) {
      const step = hwy ? 50 : e.kind === 'rural' ? 60 : 38;
      for (let s = L.s0 + 12; s < L.s1 - 8; s += step) {
        const lat = e.elevated || e.ramp ? e.hw + 0.3 : e.hw + 0.7;
        const p = LP(L, s, lat), y0 = e.elevated || e.ramp ? linkY(L, s) : 0;
        const ry2 = Math.atan2(-L.right.x, -L.right.z);
        if (!y0 && onAnyRoad(p.x, p.z, e)) continue;
        poles.add(p.x, y0 + 4.5, p.z, 0, 0.11, 9, 0.11);
        const a = LP(L, s, lat - 1.1); lampArms.add(a.x, y0 + 8.95, a.z, ry2, 0.08, 0.08, 2.2);
        const hp = LP(L, s, lat - 2.2); lampHeads.add(hp.x, y0 + 8.85, hp.z, ry2, 0.45, 0.14, 0.8);
        if (!y0) addCi(p.x, p.z, 0.2, 'pole');
      }
    }
    // 속도제한 표지판
    if (L.s1 - L.s0 > 80 && !e.ramp && e.kind !== 'alley' && L.from.edges.length >= 3) {
      const lat = e.elevated ? e.hw - 0.4 : e.hw + 1.2;
      const p = LP(L, L.s0 + 16, lat), y0 = e.elevated ? linkY(L, L.s0 + 16) : 0;
      signPoles.add(p.x, y0 + 1.3, p.z, 0, 0.05, 2.6, 0.05);
      if (speedSigns[e.limit]) speedSigns[e.limit].add(p.x, y0 + 2.55, p.z, L.heading + Math.PI, 1, 1, 1);
    }
    // 방향 안내 표지판 (큰 교차로 앞)
    if (L.to.signal && L.n >= 2 && L.s1 - L.s0 > 110 && !e.elevated && (!W.osm || (e.osm <= 2 && (cell || (W.dirSigns = (W.dirSigns || 0) + 1) < 260)))) {
      const turnTo = (o) => { const cr = L.dir.x * o.dir.z - L.dir.z * o.dir.x, dt = L.dir.x * o.dir.x + L.dir.z * o.dir.z; return dt > 0.7 ? 'S' : cr < 0 ? 'L' : 'R'; };
      const outs = L.to.out.filter((o) => o !== L.rev && o.edge.kind !== 'alley');
      const nm = (t) => { const o = outs.find((x) => turnTo(x) === t); return o ? o.edge.name : ''; };
      const lft = nm('L'), str = nm('S'), rgt = nm('R');
      const lines = [{ t: `${lft ? '← ' + lft : ''}     ${str ? '↑ ' + str : ''}     ${rgt ? rgt + ' →' : ''}`, s: 0.55 }, { t: dongAt(L.to.x, L.to.z) + ' · ' + guAt(L.to.x, L.to.z), s: 0.4, w: 600 }];
      const wdt = Math.min(L.n * LANE_W, 10);
      const pc = LP(L, L.stopS - 70, L.median / 2 + (L.n * LANE_W) / 2);
      label(lines, { bg: '#1a4fa6', w: 512, h: 112 }, pc.x, 7.2, pc.z, L.heading + Math.PI, wdt, wdt * 112 / 512 * 1.6);
      const pp = LP(L, L.stopS - 70, L.median / 2 + L.n * LANE_W + 0.8);
      poles.add(pp.x, 4, pp.z, 0, 0.18, 8, 0.18); if (!onAnyRoad(pp.x, pp.z, e)) addCi(pp.x, pp.z, 0.25, 'pole');
      const ap = LP(L, L.stopS - 70, (L.median / 2 + L.n * LANE_W + 0.8) / 2 + 0.6);
      lampArms.add(ap.x, 7.9, ap.z, Math.atan2(-L.right.x, -L.right.z), 0.15, 0.15, L.median / 2 + L.n * LANE_W);
    }
  } })();

  // ---------- 신호등 ----------
  {
    const lampGeo = new THREE.CircleGeometry(0.15, 14);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const lamps = new Inst(lampGeo, lampMat);
    const heads = new Inst(GEO.box, new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 }));
    let idx = 0;
    const SL = cell ? [] : W.signalLamps;
    for (const n of NODES) {
      if (!n.signal) continue;
      for (const L of n.inc) {
        const far = L.len + n.r * 0.85 + 2.5;
        const outer = L.median / 2 + L.n * LANE_W + 1.6;
        const pp = LP(L, far, outer);
        poles.add(pp.x, 3.6, pp.z, 0, 0.16, 7.2, 0.16);
        if (!onAnyRoad(pp.x, pp.z, null, 0.2)) addCi(pp.x, pp.z, 0.22, 'pole');
        const armLen = outer - L.median / 2;
        const ap = LP(L, far, L.median / 2 + armLen / 2);
        lampArms.add(ap.x, 6.6, ap.z, Math.atan2(L.right.x, L.right.z), 0.12, 0.12, armLen);
        const hc = LP(L, far, L.median / 2 + Math.min(L.n * LANE_W * 0.5, 4.5));
        heads.add(hc.x, 6.25, hc.z, L.heading, 1.5, 0.42, 0.32);
        const ry = Math.atan2(-L.dir.x, -L.dir.z);
        for (let k = 0; k < 4; k++) {
          const off = -0.54 + 0.36 * k;
          lamps.add(hc.x + L.right.x * off - L.dir.x * 0.17, 6.25, hc.z + L.right.z * off - L.dir.z * 0.17, ry, 1, 1, 1, 0x222222);
        }
        SL.push({ node: n, axis: L.axis, idx });
        idx += 4;
      }
    }
    const sm = idx ? lamps.build(SINK, { single: true }) : null;
    heads.build(SINK, cell ? { cast: true } : { cast: true, far: 1000 });
    if (cell) { out.signalMesh = sm; out.signalLamps = SL; } else W.signalMesh = sm;
  }

  // ---------- 다리 난간 (강 위 지상 도로) ----------
  if (!cell) for (const e of EDGES) {
    if (e.elevated || e.ramp) continue;
    let inW = false, sIn = 0;
    const flush = (s) => {
      if (s - sIn < 6) return;
      for (const sg of [1, -1]) {
        const off = e.hw + (swOf(e) || 0.6);
        let r0 = sIn, r1 = s;
        const hit = (ss) => { const p = EP(e, ss, sg * off); return onAnyRoad(p.x, p.z, e, 0.6); };
        while (r0 < r1 && hit(r0)) r0 += 2;
        while (r1 > r0 && hit(r1)) r1 -= 2;
        if (r1 - r0 < 4) continue;
        const q = EP(e, (r0 + r1) / 2, sg * off);
        obox(stat, mats.metal, q.x, q.z, e.heading, 0.18, r1 - r0, 0, 1.2);
        addOB(q.x, q.z, 0.25, (r1 - r0) / 2, e.heading, 'rail');
        const q2 = EP(e, (sIn + s) / 2, sg * (off - 0.3));
        obox(stat, mats.concrete, q2.x, q2.z, e.heading, 0.8, s - sIn + 4, -1.4, 0.05);
      }
      for (let ss = sIn + 15; ss < s - 5; ss += 28) { const q = EP(e, ss, 0); stat.add(GEO.cyl, mats.concrete, mx(q.x, -2.2, q.z, 0, 0, 0, 1.4, 4.2, 1.4)); }
      const mid = EP(e, (sIn + s) / 2, 0);
      let rv = null, rd = 1e9;
      for (const r of riversW) for (let k = 0; k < r.pts.length - 1; k++) { const d = segDist(mid.x, mid.z, r.pts[k].x, r.pts[k].z, r.pts[k + 1].x, r.pts[k + 1].z); if (d < rd) { rd = d; rv = r; } }
      const KNOWN = { 상무대로: '극락교', 무진대로: '어등대교', 광신대로: '광신대교', 하남대로: '산동교', 빛고을대로: '용산교', 평동로: '황룡강교', 어등대로: '송산교' };
      const nm = rv && rv.name !== '광주천' && KNOWN[e.name] ? KNOWN[e.name] : `${rv ? rv.name : ''} ${e.name} 다리`.trim();
      if (s - sIn > 12 && !W.landmarks.some((l) => l.name === nm)) W.landmarks.push({ name: nm, x: mid.x, z: mid.z, r: 30, bridge: true });
    };
    for (let s = 0; s <= e.len; s += 4) {
      const q = EP(e, s, 0);
      const w = waterAt(q.x, q.z);
      if (w && !inW) { inW = true; sIn = s; } else if (!w && inW) { inW = false; flush(s); }
    }
    if (inW) flush(e.len);
  }

  // ---------- 중앙선 펜스 (분리대 없는 왕복 4차선 이상 시내 도로 · 노란 기둥 + 흰 난간) ----------
  {
    const pos = [], uv = [];
    for (const e of EDGES) {
      if (e.oneway || !e.bwd || e.median >= 1 || e.elevated || e.ramp || e.tunnel || e.bridge) continue;
      if (e.kind !== 'city' || (e.n || 0) < 2) continue;
      const s0 = e.ca + 5, s1 = e.len - e.cb - 5; if (s1 - s0 < 14) continue;
      for (const [m0, m1] of freeRanges(e, s0, s1, 0, 0.4)) {
        if (m1 - m0 < 8) continue;
        for (let sa = m0; sa < m1 - 0.2; sa += 12) {
          const sb = Math.min(m1, sa + 12), a = EP(e, sa, 0), b = EP(e, sb, 0), ya = edgeY(e, sa) + ROADY, yb = edgeY(e, sb) + ROADY, H = 0.95;
          pos.push(a.x, ya, a.z, b.x, yb, b.z, b.x, yb + H, b.z, a.x, ya, a.z, b.x, yb + H, b.z, a.x, ya + H, a.z);
          const ua = sa / 2, ub = sb / 2; uv.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1);
        }
        const c = EP(e, (m0 + m1) / 2, 0); addOB(c.x, c.z, 0.12, (m1 - m0) / 2, e.heading, 'median');
      }
    }
    if (pos.length) {
      if (!mats.fence) {
        const t = canvasTex(128, 64, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = '#f4f4f0'; g.fillRect(0, 4, w, 7); g.fillRect(0, 30, w, 4);
          g.fillStyle = '#f2c418'; g.fillRect(2, 0, 9, h); g.fillStyle = '#f4f4f0'; g.fillRect(2, 18, 9, 7); g.fillRect(2, 42, 9, 7);
          g.fillStyle = 'rgba(244,244,240,.9)'; for (let x = 18; x < w; x += 9) g.fillRect(x, 11, 2, 19);
        }, { repeat: true });
        mats.fence = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.5 });
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mats.fence); m.castShadow = true; SINK.add(m);
    }
  }

  return out;
  };
  // 광주 도로 (서울 등 다른 지역은 region.js 가 칸마다 그림)
  {
    const isMain = (e) => e.reg !== 'seoul' && !e.regLazy;
    const EDG = W.edges.filter(isMain), NS = new Set(); for (const e of EDG) { NS.add(e.a); NS.add(e.b); }
    const NOD = [...NS], LNK = W.links.filter((L) => isMain(L.edge));
    if (GP && GP.pois) W.schoolZones = markSchoolZones(GP.pois, isMain);
    computeBigJ(NOD, EDG);
    progress(0.34, '차선과 표지판, 신호등을 그리는 중...');
    await tick();
    drawRoads(EDG, NOD, LNK, false);
    progress(0.48, '철도와 건널목을 만드는 중...');
    await tick();
  }
  // 칸 하나의 도로를 따로 그려 묶음(Group)으로 돌려줌 — first 일 때만 충돌 상자도 만듦
  W.drawRoadCell = (edges, nodes, links, first) => {
    const keep = { tris, stat, marks, arrowsI, busTextI, poles, lampArms, lampHeads, signPoles, speedSigns, boxes };
    tris = new Tris(400); stat = new Merger({ tile: 400 });
    marks = { white: new Inst(FLAT, mats.white), yellow: new Inst(FLAT, mats.yellow), blue: new Inst(FLAT, mats.blue) };
    arrowsI = {}; for (const k in mats.arrows) arrowsI[k] = new Inst(FLAT, mats.arrows[k]);
    busTextI = new Inst(FLAT, mats.busText);
    poles = new Inst(keep.poles.geo, keep.poles.mat); lampArms = new Inst(keep.lampArms.geo, keep.lampArms.mat); lampHeads = new Inst(keep.lampHeads.geo, keep.lampHeads.mat);
    signPoles = new Inst(keep.signPoles.geo, keep.signPoles.mat); boxes = new Inst(keep.boxes.geo, keep.boxes.mat);
    speedSigns = {}; for (const v in keep.speedSigns) speedSigns[v] = new Inst(keep.speedSigns[v].geo, keep.speedSigns[v].mat);
    const group = new THREE.Group();
    SINK = group; NOCOL = !first;
    let out;
    try {
      out = drawRoads(edges, nodes, links, true);
      tris.build(group, { planar: 8 });
      stat.build(group, { cast: true, receive: true });
      for (const k in marks) marks[k].build(group, { receive: true });
      for (const k in arrowsI) arrowsI[k].build(group, { receive: true });
      busTextI.build(group, { receive: true });
      poles.build(group, { cast: true }); lampArms.build(group, { cast: true }); lampHeads.build(group, {});
      signPoles.build(group, { cast: true }); boxes.build(group, { cast: true });
      for (const v in speedSigns) speedSigns[v].build(group, {});
      if (out.trees.length) {
        const tt = new Inst(GEO.cyl8, CELL_TREE.trunk), tc = new Inst(CELL_TREE.crownGeo, CELL_TREE.leaf);
        for (let q = 0; q < out.trees.length; q += 2) {
          const x = out.trees[q], z = out.trees[q + 1], r = 0.85 + ((x * 7.3 + z * 3.1) % 1 + 1) % 1 * 0.4;
          tt.add(x, 1.7 * r, z, 0, 0.2, 3.4 * r, 0.2); tc.add(x, 4.9 * r, z, x % 6, 2.2 * r, 2.2 * r, 2.2 * r);
        }
        tt.build(group, { cast: true }); tc.build(group, { cast: true });
      }
    } finally {
      ({ tris, stat, marks, arrowsI, busTextI, poles, lampArms, lampHeads, signPoles, speedSigns, boxes } = keep);
      SINK = scene; NOCOL = false;
    }
    out.group = group;
    return out;
  };
  // ---------- 철도 · 건널목 ----------
  {
    const RP = W.rail;
    const ballastM = new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 1 });
    const sleeper = new Inst(GEO.box, new THREE.MeshStandardMaterial({ color: 0x5b5249, roughness: 0.9 }));
    const steel = new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.9, roughness: 0.3 });
    for (const sg of RP.seg) {
      const h = Math.atan2(sg.dir.x, sg.dir.z);
      // 건널목 구간을 빼고 깔기
      const cuts = W.crossings.filter((c) => c.s >= sg.s0 - 40 && c.s <= sg.s0 + sg.len + 40).map((c) => { const sn = Math.max(0.25, Math.abs(c.edge.dir.x * sg.dir.z - c.edge.dir.z * sg.dir.x)); const w = (c.edge.hw + 3) / sn; return [c.s - sg.s0 - w, c.s - sg.s0 + w]; }).sort((a, b) => a[0] - b[0]);
      let u = 0;
      const parts = [];
      for (const [c0, c1] of cuts) { if (c0 > u) parts.push([u, c0]); u = Math.max(u, c1); }
      if (u < sg.len) parts.push([u, sg.len]);
      for (const [a, b] of parts) {
        const m = (a + b) / 2, cx = sg.a.x + sg.dir.x * m, cz = sg.a.z + sg.dir.z * m;
        // 물 위는 다리
        const wat = waterAt(cx, cz);
        obox(stat, wat ? mats.concrete : ballastM, cx, cz, h, wat ? 5 : 4.2, b - a, wat ? -1.2 : 0, 0.3);
        for (const o of [-0.72, 0.72]) obox(stat, steel, cx - sg.dir.z * o, cz + sg.dir.x * o, h, 0.08, b - a, 0.38, 0.5);
        for (let s = a + 0.3; s < b; s += 0.9) sleeper.add(sg.a.x + sg.dir.x * s, 0.33, sg.a.z + sg.dir.z * s, h + Math.PI / 2, 0.24, 0.08, 2.5);
        for (let ss = a; ss < b - 0.5; ss += 12) { const ee = Math.min(b, ss + 12), mm = (ss + ee) / 2; const px = sg.a.x + sg.dir.x * mm, pz = sg.a.z + sg.dir.z * mm; const free = [ss, mm, ee].every((t) => !onAnyRoad(sg.a.x + sg.dir.x * t, sg.a.z + sg.dir.z * t, null, 2.2)); if (free) addOBox(px, pz, 1.9, (ee - ss) / 2, h, 'rail'); }
        ogSeg(sg.a.x + sg.dir.x * a, sg.a.z + sg.dir.z * a, sg.a.x + sg.dir.x * b, sg.a.z + sg.dir.z * b, 9, 1);
      }
    }
    sleeper.build(scene, { receive: true });
    const armTex = canvasTex(32, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? '#d42a2a' : '#f2f2f2'; g.fillRect(0, y, w, 32); } });
    const armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.5 });
    for (const cr of W.crossings) {
      const e = cr.edge, rh = Math.atan2(cr.dir.x, cr.dir.z);
      obox(stat, mats.basic, cr.x, cr.z, rh, 2 * e.hw / Math.max(0.3, Math.abs(e.dir.x * cr.dir.z - e.dir.z * cr.dir.x)), 5.2, 0.0, ROADY + 0.02, 0x2a2b2d);
      for (const L of W.links.filter((l) => l.edge === e)) {
        const sl = L.rail.s;
        const px = LP(L, sl - 6.5, e.hw + 0.7);
        box(stat, mats.basic, px.x - 0.12, 0, px.z - 0.12, px.x + 0.12, 3.6, px.z + 0.12, 0xf2f2f2);
        addCircle(px.x, px.z, 0.3, 'pole');
        const len = e.hw;
        const pivot = new THREE.Group(); pivot.position.set(px.x, 1.05, px.z);
        pivot.rotation.y = L.heading;
        const arm = new THREE.Mesh(GEO.box, armMat); arm.scale.set(0.12, len, 0.12); arm.position.y = len / 2; pivot.add(arm);
        // 로컬 x 는 진행방향의 왼쪽(-right) → 팔은 도로 안쪽(왼쪽)으로 내려감
        pivot.userData = { side: 1, down: Math.PI / 2 };
        scene.add(pivot); cr.arms.push(pivot);
        const lamp = (k) => { const m = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 0 }); const d = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), m); const q = LP(L, sl - 6.66, e.hw + 0.7 + (k ? 0.25 : -0.25)); d.position.set(q.x, 2.7, q.z); d.rotation.y = L.heading + Math.PI; scene.add(d); return m; };
        cr.lamps.push(lamp(0), lamp(1));
        const xb = label([{ t: '✕ 건널목', s: 0.6 }, { t: '일단 정지', s: 0.42 }], { bg: '#f2c418', fg: '#111', w: 256, h: 160 }, px.x, 3.25, px.z, L.heading + Math.PI, 1.3, 0.8, true);
        void xb;
        const a = LP(L, sl - 6.5, e.hw / 2);
        const c = addOBox(a.x, a.z, e.hw / 2 + 0.5, 0.25, L.heading, 'barrier');
        c.off = true; cr.colliders.push(c);
      }
      W.landmarks.push({ name: `${e.name} 철도 건널목`, x: cr.x, z: cr.z, r: 30 });
    }
    W.mini.rail = { pts: RP.pts };
  }
  progress(0.54, '랜드마크를 세우는 중...');
  await tick();

  // ---------- 건물 공통 ----------
  const SIGNS = [['편의점', '#1a9c4a'], ['카페', '#6b4226'], ['치킨', '#e8a417'], ['약국', '#2d9c5a'], ['병원', '#2a6fd1'], ['은행', '#123d7a'], ['분식', '#d64545'], ['PC방', '#5b3fa8'], ['노래방', '#c2185b'], ['미용실', '#8e44ad'], ['빵집', '#c97a2a'], ['안경점', '#34495e'], ['학원', '#1f7a8c'], ['부동산', '#7a5c1f'], ['꽃집', '#e06aa0'], ['마트', '#e74c3c'], ['떡갈비', '#8f2b2b'], ['오리탕', '#6b3f1d']];
  const signMerge = SIGNS.map(([t, c]) => ({ mat: new THREE.MeshStandardMaterial({ map: textBoard([{ t, s: 0.75 }], { bg: c, w: 256, h: 80 }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5 }), M: new Merger({ tile: 600 }) }));
  signMerge.forEach((s) => { s.mat.emissiveMap = s.mat.map; W.buildingMats.push(s.mat); });
  const addSign = (k, x, y, z, ry, w = 4.5, h = 1.4) => signMerge[k].M.add(GEO.plane, signMerge[k].mat, mx(x, y, z, 0, ry, 0, w, h, 1));
  const aptColors = [0xf3efe6, 0xe9eef2, 0xf2e9dc, 0xe5ece4, 0xefe6e0];
  const shopColors = [0xf0e6d6, 0xd9e2ea, 0xe8d5cf, 0xdde8d6, 0xf2efe6, 0xcfd6dd, 0xe3d9c6, 0xbfcbd6];
  let nBld = 0;
  // 회전된 건물 (중심, 방향 ang, 폭 w(옆), 깊이 d(앞뒤), 높이 h)
  const building = (mat, cx, cz, ang, w, d, h, col, tw = 8, th = 8, y0 = 0) => {
    if (!ogCells(cx, cz, w / 2, d / 2, ang, (k) => OG.a[k] !== 1 && OG.a[k] !== 2 && OG.a[k] !== 3)) return false;
    bld.add(boxUV(w, h, d, tw, th), mat, mx(cx, y0 + h / 2, cz, 0, ang, 0), col);
    addOBox(cx, cz, w / 2, d / 2, ang, 'bld');
    ogMark(cx, cz, w / 2, d / 2, ang, 4);
    nBld++;
    return true;
  };
  const W2L = (x, z) => toXZ(x, z);
  const lm = (name, x, z, r, extra = {}) => W.landmarks.push({ name, x, z, r, ...extra });

  // ---------- 랜드마크 ----------
  const FOOT = { acc: 40, plaza: 14, cityhall: 34, station: 34, station2: 42, ballpark: 72, stadium: 88, campus: 30, chosun: 56, terminal: 40, convention: 50, memorial: 16, museum: 32, market: 26, village: 18, tower: 8, campus2: 26, temple: 14, lakepark: 10, biennale: 32 };
  const findFree = (p0, r) => {
    for (let rad = 0; rad <= 320; rad += 8) for (let k = 0; k < (rad ? 16 : 1); k++) {
      const a = (k / 16) * TAU, x = p0.x + Math.sin(a) * rad, z = p0.z + Math.cos(a) * rad;
      if (ogFree(x, z, r, r, 0)) return { x, z };
    }
    return null;
  };
  for (const L0 of LANDMARKS) {
    let p = W2L(L0.at[0], L0.at[1]);
    if (FOOT[L0.kind] && L0.kind !== 'temple') { const f = findFree(p, FOOT[L0.kind]); if (f) p = f; else continue; }
    const near = rInfo(p.x, p.z, 'surface');
    // 가까운 도로 방향에 맞춤
    let ang = 0, bd = 1e9;
    for (const e of edgesNear(p.x, p.z)) { if (e.elevated) continue; const d = segDist(p.x, p.z, e.a.x, e.a.z, e.b.x, e.b.z); if (d < bd) { bd = d; ang = e.heading; } }
    void near;
    const k = L0.kind;
    const rLm = { acc: 60, plaza: 35, cityhall: 50, station: 50, station2: 60, ballpark: 75, stadium: 90, campus: 120, chosun: 60, terminal: 60, convention: 70, memorial: 60, airport: 300, museum: 50, biennale: 70, market: 45, village: 40, tower: 40, campus2: 60, temple: 40, peak: 60, lakepark: 60, none: 40 }[k] || 40;
    lm(L0.name, p.x, p.z, rLm, { poi: L0.poi });
    const free = (hx, hz, a = ang) => ogFree(p.x, p.z, hx, hz, a);
    if (k === 'acc') {
      // 국립아시아문화전당: 지하에 묻힌 낮은 건물 + 옥상 정원
      building(mats.glass, p.x, p.z, ang, 70, 46, 6, 0xffffff, 10, 6);
      box(stat, mats.basic, p.x - 1, 6, p.z - 1, p.x + 1, 6.3, p.z + 1, 0x3d7a3a);
      obox(stat, mats.basic, p.x, p.z, ang, 72, 48, 6, 6.6, 0x4f8f3f);
      for (let i = 0; i < 12; i++) trees.push([p.x + rr(-30, 30), 6.6, p.z + rr(-20, 20), rr(0.7, 1)]);
      label([{ t: '국립아시아문화전당', s: 0.6 }, { t: 'ACC · Asia Culture Center', s: 0.38, w: 600 }], { bg: '#222', w: 512, h: 128 }, p.x - Math.sin(ang) * 23.2, 4, p.z - Math.cos(ang) * 23.2, ang + Math.PI, 16, 4);
    } else if (k === 'plaza') {
      // 5·18민주광장: 분수 + 시계탑 + 옛 전남도청
      stat.add(GEO.cyl, mats.concrete, mx(p.x, 0.3, p.z, 0, 0, 0, 7, 0.6, 7));
      tris.poly(mats.water, Array.from({ length: 20 }, (_, i) => [p.x + Math.cos(i / 20 * TAU) * 6.3, 0.62, p.z + Math.sin(i / 20 * TAU) * 6.3]));
      stat.add(GEO.cyl, mats.concrete, mx(p.x, 2, p.z, 0, 0, 0, 0.6, 3.4, 0.6));
      ogMark(p.x, p.z, 9, 9, 0, 5); addCircle(p.x, p.z, 7.2, 'fountain');
      const tx = p.x + 18, tz = p.z + 10;
      obox(stat, mats.basic, tx, tz, ang, 2.2, 2.2, 0, 14, 0xe8e2d4);
      label([{ t: '🕐', s: 0.8 }], { bg: '#ffffff', fg: '#222', w: 128, h: 128 }, tx - Math.sin(ang) * 1.12, 12, tz - Math.cos(ang) * 1.12, ang + Math.PI, 1.8, 1.8);
      addCircle(tx, tz, 1.4, 'pole');
      const ox = p.x - Math.cos(ang) * 30, oz = p.z + Math.sin(ang) * 30;
      if (ogFree(ox, oz, 20, 9, ang)) building(mats.shop, ox, oz, ang, 40, 18, 11, 0xf4f1ea, 8, 8);
    } else if (k === 'cityhall') {
      building(mats.office, p.x, p.z, ang, 30, 30, 62, 0xeef2f6, 12, 12);
      const wx = p.x + Math.cos(ang) * 30, wz = p.z - Math.sin(ang) * 30;
      building(mats.office, wx, wz, ang, 34, 22, 20, 0xe6ebf0, 12, 12);
      label([{ t: '광주광역시청', s: 0.7 }], { bg: '#1c3f73', w: 512, h: 128 }, p.x - Math.sin(ang) * 15.1, 54, p.z - Math.cos(ang) * 15.1, ang + Math.PI, 14, 3.5);
      for (const fx of [-8, 0, 8]) { const q = { x: p.x - Math.sin(ang) * 26 + Math.cos(ang) * fx, z: p.z - Math.cos(ang) * 26 - Math.sin(ang) * fx }; stat.add(GEO.cyl8, mats.metal, mx(q.x, 6, q.z, 0, 0, 0, 0.08, 12, 0.08)); addCircle(q.x, q.z, 0.2); }
    } else if (k === 'station' || k === 'station2') {
      const big = k === 'station2';
      const w = big ? 70 : 54, d = big ? 26 : 20;
      building(big ? mats.glass : mats.shop, p.x, p.z, ang, w, d, big ? 18 : 13, big ? 0xffffff : 0xf3efe6, 10, 6);
      obox(stat, mats.roof, p.x, p.z, ang, w + 4, d + 4, big ? 18 : 13, big ? 19 : 14, 0x2b5f8f);
      label([{ t: L0.name, s: 0.72 }, { t: big ? 'GWANGJU SONGJEONG · KTX' : 'GWANGJU STATION', s: 0.36, w: 600 }], { bg: '#174ea6', w: 512, h: 160 }, p.x - Math.sin(ang) * (d / 2 + 0.06), big ? 14 : 10, p.z - Math.cos(ang) * (d / 2 + 0.06), ang + Math.PI, 16, 5);
      // 역 앞 광장 · 택시 승강장
      const fx = p.x - Math.sin(ang) * (d / 2 + 12), fz = p.z - Math.cos(ang) * (d / 2 + 12);
      obox(stat, mats.concrete, fx, fz, ang, w, 20, 0, 0.12);
      ogMark(fx, fz, w / 2, 10, ang, 5);
      // 승강장
      const rd = railDist(p.x, p.z);
      if (rd.d < 120) { const rp = railPoint(rd.s); const rh = Math.atan2(rp.dir.x, rp.dir.z); obox(stat, mats.concrete, rp.x + rp.dir.z * 4.5, rp.z - rp.dir.x * 4.5, rh, 4, 120, 0, 1.1); obox(stat, mats.roof, rp.x + rp.dir.z * 4.5, rp.z - rp.dir.x * 4.5, rh, 5, 100, 4.6, 4.9, 0x2b5f8f); if (!onAnyRoad(rp.x + rp.dir.z * 4.5, rp.z - rp.dir.x * 4.5, null, 3)) addOBox(rp.x + rp.dir.z * 4.5, rp.z - rp.dir.x * 4.5, 2, 60, rh, 'platform'); if (big) W.station = { s: rd.s }; else W.station2 = { s: rd.s }; }
    } else if (k === 'ballpark' || k === 'stadium') {
      const R0 = k === 'ballpark' ? 62 : 78, segs = 28, arc = k === 'ballpark' ? 0.72 : 1;
      for (let i = 0; i < segs * arc; i++) {
        const a0 = ang + Math.PI * 0.62 + (i / segs) * TAU, am = a0 + TAU / segs / 2;
        const cx = p.x + Math.sin(am) * R0, cz = p.z + Math.cos(am) * R0;
        const lenS = (TAU * R0) / segs + 0.5;
        stat.add(GEO.box, mats.basic, mx(cx, 9, cz, -0.35, am + Math.PI / 2, 0, lenS, 2, 22), k === 'ballpark' ? 0xd23a3a : 0xe8edf2);
        stat.add(GEO.box, mats.basic, mx(cx + Math.sin(am) * 9, 9, cz + Math.cos(am) * 9, 0, am + Math.PI / 2, 0, lenS, 18, 1.2), 0xcfd6dd);
        if (k === 'stadium') stat.add(GEO.box, mats.basic, mx(cx - Math.sin(am) * 4, 21, cz - Math.cos(am) * 4, 0.15, am + Math.PI / 2, 0, lenS, 0.6, 26), 0xf4f6f8);
        addOBox(cx + Math.sin(am) * 6, cz + Math.cos(am) * 6, lenS / 2, 7, am + Math.PI / 2, 'bld');
      }
      tris.poly(mats.lawn, Array.from({ length: 24 }, (_, i) => [p.x + Math.sin(i / 24 * TAU) * (R0 - 12), 0.05, p.z + Math.cos(i / 24 * TAU) * (R0 - 12)]));
      if (k === 'ballpark') for (let i = 0; i < 4; i++) { const a = ang + 0.8 + i * 0.9; const q = { x: p.x + Math.sin(a) * (R0 + 8), z: p.z + Math.cos(a) * (R0 + 8) }; stat.add(GEO.cyl8, mats.metal, mx(q.x, 20, q.z, 0, 0, 0, 0.6, 40, 0.6)); box(stat, mats.basic, q.x - 3, 39, q.z - 3, q.x + 3, 42, q.z + 3, 0xffffff); }
      ogMark(p.x, p.z, R0 + 12, R0 + 12, 0, 5);
    } else if (k === 'campus' || k === 'campus2' || k === 'chosun') {
      let n = k === 'campus' ? 12 : k === 'chosun' ? 3 : 6;
      if (k === 'chosun') {
        // 조선대 본관: 하얀 긴 건물 + 뾰족 지붕 여러 개
        const w = 110;
        building(mats.shop, p.x, p.z, ang, w, 14, 16, 0xf6f6f2, 8, 8);
        for (let i = -5; i <= 5; i++) { const q = { x: p.x + Math.cos(ang) * i * 10, z: p.z - Math.sin(ang) * i * 10 }; stat.add(new THREE.ConeGeometry(5.5, 9, 4), mats.roof, mx(q.x, 20.5, q.z, 0, ang + Math.PI / 4, 0), 0xf2f2ee); }
      }
      for (let i = 0; i < n * 3 && n > 0; i++) {
        const q = { x: p.x + rr(-rLm, rLm) * 0.8, z: p.z + rr(-rLm, rLm) * 0.8 };
        const w = rr(26, 50), d = rr(12, 18);
        if (!ogFree(q.x, q.z, w / 2 + 3, d / 2 + 3, ang)) continue;
        building(mats.shop, q.x, q.z, ang, w, d, rr(12, 24), pick([0xe8d5cf, 0xd8c3b0, 0xf0e6d6, 0xdcdcd4], R));
        if (--n <= 0) break;
      }
      for (let i = 0; i < 40; i++) trees.push([p.x + rr(-rLm, rLm), 0.05, p.z + rr(-rLm, rLm), rr(0.8, 1.3)]);
    } else if (k === 'terminal' || k === 'convention') {
      const w = k === 'terminal' ? 70 : 90, d = k === 'terminal' ? 44 : 50;
      if (free(w / 2, d / 2)) {
        building(k === 'terminal' ? mats.office : mats.glass, p.x, p.z, ang, w, d, k === 'terminal' ? 26 : 18, 0xffffff, 12, 12);
        label([{ t: k === 'terminal' ? 'U-SQUARE 광주종합버스터미널' : '김대중컨벤션센터', s: 0.55 }], { bg: k === 'terminal' ? '#c2185b' : '#1f7a8c', w: 768, h: 128 }, p.x - Math.sin(ang) * (d / 2 + 0.06), k === 'terminal' ? 22 : 14, p.z - Math.cos(ang) * (d / 2 + 0.06), ang + Math.PI, 24, 4);
      }
    } else if (k === 'memorial') {
      stat.add(GEO.box, mats.basic, mx(p.x, 18, p.z, 0, ang, 0, 2.4, 36, 2.4), 0xe6e2d8);
      stat.add(GEO.box, mats.basic, mx(p.x, 1, p.z, 0, ang, 0, 14, 2, 14), 0xbdb8ae);
      addOBox(p.x, p.z, 7, 7, ang, 'bld'); ogMark(p.x, p.z, 50, 50, 0, 5);
      for (let i = 0; i < 70; i++) { const a = R() * TAU, rd = rr(14, 55); trees.push([p.x + Math.sin(a) * rd, 0.05, p.z + Math.cos(a) * rd, rr(0.9, 1.4)]); }
    } else if (k === 'airport') {
      // 활주로 2개 (04/22 방향, 실제 2,835m)
      const rh = (40 * Math.PI) / 180;
      const len = 2835 * SCALE;
      for (const o of [-35, 35]) {
        const cx = p.x + Math.cos(rh) * o, cz = p.z - Math.sin(rh) * o;
        obox(stat, mats.basic, cx, cz, -rh, 20, len, 0, 0.05, 0x4a4d52);
        for (let s = -len / 2 + 20; s < len / 2 - 20; s += 30) mark('white', cx - Math.sin(rh) * s, cz - Math.cos(rh) * s, -rh, 0.6, 14, 0.07);
        ogMark(cx, cz, 30, len / 2 + 10, -rh, 5);
      }
      const tx = p.x + Math.cos(rh) * 110, tz = p.z - Math.sin(rh) * 110;
      building(mats.glass, tx, tz, -rh, 90, 30, 14, 0xffffff, 10, 6);
      label([{ t: '광주공항 GWANGJU AIRPORT', s: 0.6 }], { bg: '#174ea6', w: 768, h: 128 }, tx + Math.cos(rh) * 15.1, 11, tz - Math.sin(rh) * 15.1, -rh + Math.PI / 2, 26, 4.3);
      stat.add(GEO.cyl8, mats.basic, mx(tx + 60, 14, tz, 0, 0, 0, 2, 28, 2), 0xf2f2f2);
      // 울타리
      for (const sg of [1, -1]) { const fx = p.x + Math.cos(rh) * sg * 70, fz = p.z - Math.sin(rh) * sg * 70; obox(stat, mats.metal, fx, fz, -rh, 0.1, len + 40, 0, 2.4); addOBox(fx, fz, 0.3, len / 2 + 20, -rh, 'fence'); }
    } else if (k === 'museum' || k === 'temple') {
      const nb = k === 'temple' ? 3 : 1;
      for (let i = 0; i < nb; i++) {
        const q = { x: p.x + Math.cos(ang) * (i - (nb - 1) / 2) * 26, z: p.z - Math.sin(ang) * (i - (nb - 1) / 2) * 26 };
        const w = k === 'museum' ? 60 : 18, d = k === 'museum' ? 24 : 10;
        const y0 = terrainH(q.x, q.z);
        building(mats.shop, q.x, q.z, ang, w, d, 7, 0xe9dfcf, 8, 8, y0);
        stat.add(new THREE.ConeGeometry(1, 1, 4), mats.roof, mx(q.x, y0 + 9, q.z, 0, ang + Math.PI / 4, 0, w * 0.78, 4.5, d * 0.95), 0x3a3d40);
        box(stat, mats.basic, q.x - 0.2, y0 + 6.8, q.z - 0.2, q.x + 0.2, y0 + 7.1, q.z + 0.2, 0x8a3324);
      }
    } else if (k === 'market') {
      for (let i = 0; i < 3; i++) {
        const q = { x: p.x + Math.cos(ang) * (i - 1) * 16, z: p.z - Math.sin(ang) * (i - 1) * 16 };
        if (!ogFree(q.x, q.z, 7, 22, ang)) continue;
        building(mats.shop, q.x, q.z, ang, 14, 44, 6, pick(shopColors, R));
        obox(stat, mats.vinyl, q.x, q.z, ang, 15, 45, 6, 7.5);
      }
      const fq = { x: p.x - Math.sin(ang) * 26, z: p.z - Math.cos(ang) * 26 };
      label([{ t: L0.name, s: 0.7 }], { bg: '#8f2b2b', w: 512, h: 128 }, fq.x, 6, fq.z, ang + Math.PI, 12, 3, true);
    } else if (k === 'village') {
      for (let i = 0; i < 14; i++) {
        const q = { x: p.x + rr(-30, 30), z: p.z + rr(-30, 30) };
        if (!ogFree(q.x, q.z, 6, 5, ang)) continue;
        building(mats.shop, q.x, q.z, ang, 11, 9, rr(4, 7), pick([0xf2d16b, 0x8fc3e8, 0xf0a5a5, 0xa8d8a8, 0xffffff], R));
      }
    } else if (k === 'tower') {
      stat.add(GEO.cyl, mats.basic, mx(p.x, 14, p.z, 0, 0, 0, 1.6, 28, 1.6), 0xe0dcd2);
      stat.add(GEO.cyl, mats.glass, mx(p.x, 29, p.z, 0, 0, 0, 5, 4, 5));
      addCircle(p.x, p.z, 2, 'bld'); ogMark(p.x, p.z, 40, 40, 0, 5);
      for (let i = 0; i < 60; i++) { const a = R() * TAU, rd = rr(6, 40); trees.push([p.x + Math.sin(a) * rd, 0.05, p.z + Math.cos(a) * rd, rr(0.9, 1.4)]); }
    } else if (k === 'peak') {
      const y0 = terrainH(p.x, p.z);
      for (let i = 0; i < 9; i++) stat.add(GEO.box, mats.rock, mx(p.x + rr(-8, 8), y0 + rr(1, 5), p.z + rr(-8, 8), R(), R(), 0, rr(2, 4), rr(6, 12), rr(2, 4)));
      label([{ t: '무등산 서석대 1,100m', s: 0.55 }], { bg: '#2c5c2a', w: 512, h: 112 }, p.x, y0 + 14, p.z, 0, 8, 1.8, true);
    } else if (k === 'lakepark' || k === 'biennale') {
      const y0 = 0;
      building(mats.shop, p.x, p.z, ang, k === 'biennale' ? 60 : 16, k === 'biennale' ? 30 : 10, k === 'biennale' ? 14 : 5, 0xf0ece4, 8, 8, y0);
      for (let i = 0; i < 50; i++) { const a = R() * TAU, rd = rr(12, 70); trees.push([p.x + Math.sin(a) * rd, 0.05, p.z + Math.cos(a) * rd, rr(0.9, 1.4)]); }
    }
  }
  // 아파트 동 번호
  let dongNo = 101;
  progress(0.6, '주차장과 주유소를 만드는 중...');
  await tick();

  // ---------- 주차 연습장 + 지하주차장 (상무지구) ----------
  {
    const c = toXZ(35.1505, 126.8425);
    const x0 = c.x - 85, x1 = c.x + 85, z0 = c.z - 55, z1 = c.z + 55;
    W.parkingArea = { x0, x1, z0, z1 };
    ogMark(c.x, c.z, 92, 62, 0, 5);
    const rpx0 = x1 - 70, rpx1 = x1 - 16, rpz0 = z1 - 30, rpz1 = z1 - 22;
    for (const [a, b, c2, d] of [[x0, z0, x1, rpz0], [x0, rpz1, x1, z1], [x0, rpz0, rpx0, rpz1], [rpx1, rpz0, x1, rpz1]]) tris.quad(mats.asphalt, [a, ROADY, b], [c2, ROADY, b], [c2, ROADY, d], [a, ROADY, d]);
    const parked = [];
    const rowZ = [z0 + 12, z0 + 17.2, z0 + 40, z0 + 45.2, z0 + 68, z0 + 73.2];
    rowZ.forEach((zc, ri) => {
      const facing = ri % 2 === 0 ? Math.PI : 0;
      for (let x = x0 + 12; x < x1 - 40; x += 2.6) {
        mark('white', x - 1.3, zc, 0, 0.12, 5);
        const spot = { x, z: zc, heading: facing, w: 2.5, l: 5.0, kind: 'car' };
        if (R() < 0.35) parked.push(spot); else W.parkingSpots.push(spot);
      }
    });
    for (let b = 0; b < 5; b++) {
      const x = x0 + 20 + b * 4.6, zz = z1 - 16;
      mark('yellow', x - 2.3, zz, 0, 0.18, 14);
      W.busBays.push({ x, z: zz, heading: 0, w: 3.8, l: 13.5, kind: 'bus' });
    }
    // 울타리 (입구는 도로 쪽 한 곳)
    for (const [ax, az, bx, bz] of [[x0, z0, x0, z1], [x1, z0, x1, z1], [x0, z1, x1, z1]]) {
      box(stat, mats.metal, Math.min(ax, bx) - 0.08, 0, Math.min(az, bz) - 0.08, Math.max(ax, bx) + 0.08, 1.2, Math.max(az, bz) + 0.08);
      addBox(Math.min(ax, bx) - 0.2, Math.min(az, bz) - 0.2, Math.max(ax, bx) + 0.2, Math.max(az, bz) + 0.2, 'fence');
    }
    label([{ t: 'P 주차 연습장', s: 0.6 }], { bg: '#1a4fa6', w: 512, h: 128 }, c.x, 4, z0 - 1, Math.PI, 10, 2.5, true);
    W.parkedSpotsUsed = parked;
    lm('주차 연습장', c.x, c.z, 70);
    // 지하주차장
    UG = { y: -4.0, rect: { x0: x0 + 4, x1: x1 - 4, z0: z0 + 4, z1: z1 - 4 }, ramp: { x0: rpx0, x1: rpx1, z0: rpz0, z1: rpz1 } };
    buildUG();
  }
  function buildUG() {
    const r = UG.rect, rp = UG.ramp, Y = UG.y;
    const tag = (c, lvl) => { c.lvl = lvl; return c; };
    const ugM = new Merger();
    const floorM = new THREE.MeshStandardMaterial({ color: 0x5f8272, roughness: 0.45, metalness: 0.1 });
    const ceilM = new THREE.MeshStandardMaterial({ color: 0xb9bcb8, roughness: 0.95, side: THREE.DoubleSide });
    const lightM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 1.6 });
    plane(ugM, floorM, r.x0, r.z0, r.x1, r.z1, Y);
    const T2 = 0.5;
    for (const [x0, z0, x1, z1] of [[r.x0 - T2, r.z0 - T2, r.x1 + T2, r.z0], [r.x0 - T2, r.z1, r.x1 + T2, r.z1 + T2], [r.x0 - T2, r.z0, r.x0, r.z1], [r.x1, r.z0, r.x1 + T2, r.z1]]) {
      box(ugM, mats.concrete, x0, Y - 0.2, z0, x1, -0.3, z1);
      tag(addBox(x0, z0, x1, z1, 'ugwall'), 'ug');
    }
    // 경사로 + 옆벽
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([rp.x0, 0.07, rp.z0, rp.x1, Y, rp.z0, rp.x1, Y, rp.z1, rp.x0, 0.07, rp.z1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    const rm = new THREE.Mesh(g, mats.asphalt); scene.add(rm);
    // 경사로 구멍을 가리는 지상 바닥 대신: 구멍 둘레 벽
    for (const z of [rp.z0 - 0.25, rp.z1 + 0.25]) {
      box(ugM, mats.concrete, rp.x0 - 0.25, Y, z - 0.25, rp.x1, 1.2, z + 0.25);
      tag(addBox(rp.x0 - 0.5, z - 0.3, rp.x1, z + 0.3, 'rampwall'), 'both');
    }
    box(ugM, mats.concrete, rp.x1, 0.06, rp.z0 - 0.5, rp.x1 + 0.4, 1.2, rp.z1 + 0.5);
    tag(addBox(rp.x1, rp.z0 - 0.5, rp.x1 + 0.4, rp.z1 + 0.5, 'parapet'), 'surface');
    // 천장 (경사로 부분 제외)
    plane(ugM, ceilM, r.x0, r.z0, r.x1, rp.z0, -0.35);
    plane(ugM, ceilM, r.x0, rp.z1, r.x1, r.z1, -0.35);
    plane(ugM, ceilM, r.x0, rp.z0, rp.x0, rp.z1, -0.35);
    plane(ugM, ceilM, rp.x1, rp.z0, r.x1, rp.z1, -0.35);
    box(ugM, mats.basic, rp.x0 - 0.8, 0.06, rp.z0 - 0.4, rp.x0 - 0.6, 2.8, rp.z0 - 0.2, 0x222222);
    box(ugM, mats.basic, rp.x0 - 0.8, 0.06, rp.z1 + 0.2, rp.x0 - 0.6, 2.8, rp.z1 + 0.4, 0x222222);
    box(ugM, mats.yellow, rp.x0 - 0.8, 2.5, rp.z0 - 0.4, rp.x0 - 0.6, 2.75, rp.z1 + 0.4);
    const hb = tag(addBox(rp.x0 - 1.2, rp.z0, rp.x0 - 0.4, rp.z1, 'heightbar'), 'surface'); hb.busOnly = true;
    label([{ t: 'B1 지하주차장', s: 0.55 }, { t: '높이제한 2.3m · 버스 진입 금지', s: 0.36, c: '#ffd34a' }], { bg: '#1a4fa6', w: 512, h: 160 }, rp.x0 - 0.7, 3.7, (rp.z0 + rp.z1) / 2, -Math.PI / 2, 5, 1.6, true);
    const lights = new Inst(GEO.box, lightM);
    const ugParked = [];
    for (let k = 0; k < 9; k++) {
      const zb = r.z0 + 3 + k * 17.5;
      if (zb + 10 > r.z1 - 2) break;
      for (const [zc, facing] of [[zb + 2.5, Math.PI], [zb + 7.5, 0]]) {
        for (let x = r.x0 + 6; x < r.x1 - 4; x += 2.6) {
          if (zc > rp.z0 - 9 && x > rp.x0 - 6) continue;
          mark('white', x - 1.3, zc, 0, 0.12, 5, Y + 0.02);
          const spot = { x, z: zc, heading: facing, w: 2.5, l: 5.0, kind: 'car', y: Y, level: 'ug' };
          if (R() < 0.05 && ugParked.length < 22) ugParked.push(spot); else W.ugSpots.push(spot);
        }
      }
      for (let x = r.x0 + 6 + 3 * 2.6; x < r.x1 - 6; x += 3 * 2.6) {
        if (zb + 5 > rp.z0 - 9 && x > rp.x0 - 8) continue;
        box(ugM, mats.basic, x - 1.3 - 0.35, Y, zb + 5 - 0.35, x - 1.3 + 0.35, -0.35, zb + 5 + 0.35, 0xc9ccc6);
        tag(addBox(x - 1.3 - 0.4, zb + 4.6, x - 1.3 + 0.4, zb + 5.4, 'pillar'), 'ug');
      }
      for (let x = r.x0 + 10; x < r.x1 - 6; x += 12) lights.add(x, -0.42, zb + 12.5, 0, 2.4, 0.06, 0.3);
    }
    lights.build(scene);
    ugM.build(scene, { cast: true, receive: true });
    for (const sp of ugParked) {
      const spec = pick(CARS, R);
      const car = buildCar(spec, { color: pick(['#eeeeec', '#121315', '#b5bac0', '#555b63', '#5a1922'], R), lod: true });
      car.group.position.set(sp.x, Y, sp.z); car.group.rotation.y = sp.heading; scene.add(car.group);
      tag(addBox(sp.x - spec.wid / 2, sp.z - spec.len / 2, sp.x + spec.wid / 2, sp.z + spec.len / 2, 'car'), 'ug');
    }
    lm('지하주차장 입구', (rp.x0 + rp.x1) / 2, (rp.z0 + rp.z1) / 2, 25);
  }
  // 땅 (지하주차장 경사로 자리만 비움)
  {
    const g = W.groundGeo;
    const m = new THREE.Mesh(g, mats.grass); m.receiveShadow = true; m.position.y = -0.02;
    scene.add(m);
    // 경사로 구멍: 땅 위에 덮이지 않게 경사로 위치는 땅을 살짝 내림
    const pos = g.attributes.position, rp = UG.ramp;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); if (x > rp.x0 - 64 && x < rp.x1 + 64 && z > rp.z0 - 64 && z < rp.z1 + 64) pos.setY(i, -6); }
    pos.needsUpdate = true;
    // 내린 부분 주변 땅 다시 덮기 (경사로 제외)
    const hx0 = rp.x0 - 64, hx1 = rp.x1 + 64, hz0 = rp.z0 - 64, hz1 = rp.z1 + 64;
    for (const [a, b, c2, d] of [[hx0 - 70, hz0 - 70, hx1 + 70, rp.z0], [hx0 - 70, rp.z1, hx1 + 70, hz1 + 70], [hx0 - 70, rp.z0, rp.x0, rp.z1], [rp.x1, rp.z0, hx1 + 70, rp.z1]]) tris.quad(mats.lawn, [a, 0.0, b], [c2, 0.0, b], [c2, 0.0, d], [a, 0.0, d], undefined);
  }
  // ---------- 주유소 (도로변) ----------
  const gas = [['빛고을주유소 (상무)', 35.1478, 126.8560], ['무등주유소 (서방)', 35.1712, 126.9250], ['봉선 전기차 충전소', 35.1290, 126.9120], ['송정주유소', 35.1428, 126.7975], ['첨단주유소', 35.2160, 126.8520], ['진월주유소', 35.1205, 126.8975]];
  for (const [name, lat, lon] of gas) {
    const p = toXZ(lat, lon);
    const r = rInfo(p.x, p.z, 'surface') || null;
    let e = r && r.edge;
    if (!e) { let bd = 1e9; for (const ee of edgesNear(p.x, p.z)) { if (ee.elevated || ee.ramp) continue; const d = segDist(p.x, p.z, ee.a.x, ee.a.z, ee.b.x, ee.b.z); if (d < bd) { bd = d; e = ee; } } }
    if (!e) continue;
    const s = clamp((p.x - e.a.x) * e.dir.x + (p.z - e.a.z) * e.dir.z, e.ca + 30, e.len - e.cb - 30);
    const off = e.hw + SIDEWALK + 18;
    const q = EP(e, s, off);
    const ang = e.heading;
    if (!ogFree(q.x, q.z, 22, 15, ang)) continue;
    ogMark(q.x, q.z, 24, 17, ang, 5);
    tris.poly(mats.asphalt, [[-22, -15], [22, -15], [22, 15], [-22, 15]].map(([u, v]) => { const pp = EP(e, s + u, off + v); return [pp.x, ROADY, pp.z]; }));
    obox(stat, mats.basic, q.x, q.z, ang, 18, 26, 5.5, 6.3, 0xf2f2f2);
    obox(stat, mats.basic, q.x, q.z, ang, 18.2, 26.2, 6.3, 6.7, 0xd0322f);
    for (const [u, v] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) { const pp = EP(e, s + u, off + v); box(stat, mats.metal, pp.x - 0.3, 0, pp.z - 0.3, pp.x + 0.3, 5.5, pp.z + 0.3); addCircle(pp.x, pp.z, 0.5, 'pole'); }
    for (const u of [-4, 4]) { const pp = EP(e, s + u, off); obox(stat, mats.basic, pp.x, pp.z, ang, 2, 1.2, 0, 1.9, 0xd0322f); addOBox(pp.x, pp.z, 1, 0.6, ang, 'pump'); }
    const shop = EP(e, s, off + 12); building(mats.shop, shop.x, shop.z, ang, 16, 6, 5, 0xf3e7d0);
    const lb = EP(e, s, off - 6.6);
    label([{ t: name, s: 0.5 }], { bg: /충전/.test(name) ? '#2c62c8' : '#c0392b', w: 512, h: 96 }, lb.x, 7.4, lb.z, ang + Math.PI / 2, 14, 2.6, true);
    const xs = [EP(e, s - 22, off - 15), EP(e, s + 22, off + 15)];
    const zone = { type: /충전/.test(name) ? 'ev' : 'fuel', name, x0: Math.min(xs[0].x, xs[1].x), x1: Math.max(xs[0].x, xs[1].x), z0: Math.min(xs[0].z, xs[1].z), z1: Math.max(xs[0].z, xs[1].z) };
    W.zones.push(zone);
    if (zone.type === 'fuel') W.zones.push({ ...zone, type: 'ev', name: name.split(' ')[0] + ' 전기차 충전기' });
    lm(name, q.x, q.z, 30);
  }
  // ---------- 톨게이트 ----------
  W.tolls = [];
  // 요금소 하나 (도로 e 의 s 지점, 모든 차로에 부스)
  const tollPlaza = (e, s, name, kind, fee) => {
    s = clamp(s, Math.min(e.len / 2, (e.ca || 0) + 9), Math.max(e.len / 2, e.len - (e.cb || 0) - 9));
    const y = edgeY(e, s), c = EP(e, s, 0), up = e.elevated;
    const wide = e.hw * 2 + 4;
    obox(stat, mats.concrete, c.x, c.z, e.heading, wide, 16, y + 6.6, y + 7.6);
    obox(stat, mats.yellow, c.x, c.z, e.heading, wide, 16.2, y + 6.4, y + 6.6);
    for (const L of [e.fwd, e.bwd]) {
      if (!L) continue;
      const sL = L === e.fwd ? s : e.len - s;
      for (let i = 0; i <= L.n; i++) {
        const off = L.median / 2 + LANE_W * i;
        const q = { x: L.from.x + L.dir.x * sL + L.right.x * off, z: L.from.z + L.dir.z * sL + L.right.z * off };
        obox(stat, mats.basic, q.x, q.z, e.heading, 0.8, 2.4, y, y + 2.7, 0xe8e8e0);
        obox(stat, mats.concrete, q.x, q.z, e.heading, 0.8, 14, y, y + 0.35);
        obox(stat, mats.yellow, q.x, q.z, e.heading, 0.82, 0.5, y + 0.35, y + 1.2);
        const k = addOBox(q.x, q.z, 0.4, 7, e.heading, 'toll'); if (up) { k.lvl = 'hwy'; k.y = y; }
      }
    }
    const tb = textBoard([{ t: name, s: 0.6 }, { t: kind === 'closed' ? '하이패스 ▼   통행권 ▼' : '하이패스 ▼   일반 ▼', s: 0.42 }], { bg: '#1e6e3a', w: 768, h: 160 });
    for (const sg of [1, -1]) {
      const q = EP(e, s + sg * 8.2, 0);
      const sm = new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: tb }));
      sm.scale.set(Math.min(2 * e.hw, 26), 1.6, 1); sm.position.set(q.x, y + 7.1, q.z); sm.rotation.y = e.heading + (sg > 0 ? 0 : Math.PI); scene.add(sm);
    }
    const ex = Math.abs(e.dir.x) * 6 + Math.abs(e.dir.z) * e.hw, ez = Math.abs(e.dir.z) * 6 + Math.abs(e.dir.x) * e.hw;
    const entry = { name, kind, fee, x: c.x, z: c.z, y, edge: e, s };
    W.zones.push({ type: 'toll', x0: c.x - ex, x1: c.x + ex, z0: c.z - ez, z1: c.z + ez, y, toll: entry });
    W.tolls.push(entry);
    e.toll = entry;
    if (!W.toll) W.toll = { x: c.x, z: c.z };
    return entry;
  };
  W.tollPlaza = tollPlaza;
  if (W.osm) {
    // 실제 요금소 위치 (오픈스트리트맵 toll_booth). 제2순환도로는 구간마다 내는 개방식, 고속도로 나들목은 폐쇄식(통행권)
    const TOLLS = [
      ['소태요금소', 35.12628, 126.93938, 'open', 1100], ['송암요금소', 35.11522, 126.87497, 'open', 1100],
      ['유덕요금소', 35.15883, 126.82672, 'open', 1100], ['유덕요금소', 35.16059, 126.82984, 'open', 1100], ['유덕요금소', 35.16687, 126.8308, 'open', 1100],
      ['학운요금소', 35.13036, 126.9393, 'open', 1100], ['학운요금소', 35.13483, 126.93956, 'open', 1100],
      ['동광주요금소', 35.20763, 126.93939, 'ramp', 0], ['남광산요금소', 35.1911, 126.7556, 'ramp', 0], ['남장성요금소', 35.22236, 126.79392, 'ramp', 0],
    ];
    const used = new Set();
    for (const [name, lat, lon, kind, fee] of TOLLS) {
      const p = toXZ(lat, lon);
      const cands = [];
      for (const e of edgesNear(p.x, p.z)) {
        if (!(e.kind === 'highway' || e.kind === 'ic')) continue;
        const ss = (p.x - e.a.x) * e.dir.x + (p.z - e.a.z) * e.dir.z;
        const d = segDist(p.x, p.z, e.a.x, e.a.z, e.b.x, e.b.z);
        if (d < 70 && ss > -10 && ss < e.len + 10) cands.push({ e, ss, d });
      }
      cands.sort((u, v) => u.d - v.d);
      if (cands.length && cands[0].d > 30) cands.length = 0;
      const pickE = [];
      if (cands.length) {
        const e0 = cands[0].e; pickE.push(cands[0]);
        // 본선(분리 도로)이면 반대 방향 차로에도
        if (e0.kind === 'highway' && e0.oneway) {
          const op = cands.find((c) => c.e !== e0 && c.e.name === e0.name && c.e.oneway && Math.cos(c.e.heading - e0.heading) < -0.8);
          if (op) pickE.push(op);
        }
      }
      for (const { e, ss } of pickE) { if (used.has(e) || e.len < 18) continue; used.add(e); tollPlaza(e, ss, name, kind, fee); }
      lm(name, p.x, p.z, 30);
    }
  } else {
    const e = W.edges.filter((x) => x.name === '호남고속도로').sort((a, b) => Math.hypot((a.a.x + a.b.x) / 2 - W.anchorNode['광산IC@hi'].x, (a.a.z + a.b.z) / 2 - W.anchorNode['광산IC@hi'].z) - Math.hypot((b.a.x + b.b.x) / 2 - W.anchorNode['광산IC@hi'].x, (b.a.z + b.b.z) / 2 - W.anchorNode['광산IC@hi'].z)).find((x) => x.len > 200 && (x.a.x + x.b.x) / 2 > W.anchorNode['광산IC@hi'].x);
    if (e) { tollPlaza(e, e.len / 2, '광주 톨게이트', 'open', 1100); lm('광주 톨게이트', EP(e, e.len / 2, 0).x, EP(e, e.len / 2, 0).z, 30); }
  }
  progress(0.66, '광주의 건물을 짓는 중...');
  await tick();

  if (W.osm) {
    // ---------- 실제 건물 (오픈스트리트맵 외곽선을 높이만큼 세움) ----------
    progress(0.7, '실제 건물을 세우는 중...');
    await tick();
    prepOsmBuildings(scene, zoneOf, mats, aptColors, shopColors);
  } else {
  // ---------- 길가 건물 ----------
  const maxB = 9500;
  for (const L of W.links) {
    const e = L.edge;
    if (e.elevated || e.ramp || e.kind === 'highway' || e.kind === 'mountain' || e.kind === 'coast') continue;
    if (L.s1 - L.s0 < 20) continue;
    const mid = LP(L, (L.s0 + L.s1) / 2, 0);
    const zk = zoneOf(mid.x, mid.z);
    if (zk === 'park' || zk === 'campus') continue;
    const setback = e.hw + (walkKinds.includes(e.kind) ? SIDEWALK : 2) + 0.8;
    let s = L.s0 + 5;
    while (s < L.s1 - 8 && nBld < maxB) {
      let w, d, h, mat, col, sign = false, tw = 8, th = 8;
      if (zk === 'cbd') { w = rr(22, 40); d = rr(20, 34); h = e.n >= 3 ? rr(40, 120) : rr(18, 50); mat = R() < 0.6 ? mats.office : mats.shop; col = pick([0xffffff, 0xdfe8f0, 0xe6f0f2, 0xd6dde6, 0xf0e6d6], R); tw = th = 12; sign = mat === mats.shop; }
      else if (zk === 'ind') { w = rr(30, 55); d = rr(20, 35); h = rr(8, 14); mat = mats.factory; col = pick([0xd0d4d8, 0xb9c4cc, 0xe0dcd0, 0x9fb2c4], R); }
      else if (zk === 'rural') { if (R() < 0.75) { s += rr(30, 80); continue; } w = rr(10, 16); d = rr(8, 12); h = rr(3.5, 6); mat = mats.shop; col = pick([0xf2efe6, 0xe8e0d0, 0xdfe6e8], R); }
      else if (e.kind === 'alley') { w = rr(9, 15); d = rr(9, 14); h = rr(6, 14); mat = mats.shop; col = pick(shopColors, R); sign = R() < 0.6; }
      else { w = rr(12, 24); d = rr(12, 20); h = e.n >= 3 ? rr(12, 34) : rr(8, 20); mat = mats.shop; col = pick(shopColors, R); sign = true; }
      if (s + w > L.s1 - 4) break;
      const c = LP(L, s + w / 2, setback + d / 2);
      const ang = L.heading;
      if (terrainH(c.x, c.z) < 0.6 && ogFree(c.x, c.z, d / 2, w / 2, ang)) {
        building(mat, c.x, c.z, ang, d, w, h, col, tw, th);
        if (zk === 'rural' && R() < 0.7) stat.add(new THREE.ConeGeometry(1, 1, 4), mats.roof, mx(c.x, h + 1.4, c.z, 0, ang + Math.PI / 4, 0, d * 0.78, 2.8, w * 0.78), pick([0xb04a3a, 0x3a5fa0, 0x4a7a4a], R));
        if (sign && R() < 0.85) {
          const f = LP(L, s + w / 2, setback - 0.08);
          addSign(Math.floor(R() * SIGNS.length), f.x, 4.2, f.z, ang + Math.PI / 2, Math.min(w - 3, 7), 1.4);
        }
        s += w + rr(1, zk === 'cbd' ? 8 : 4);
      } else s += 6;
    }
  }
  progress(0.74, '아파트 단지와 동네를 채우는 중...');
  await tick();
  // ---------- 동네 안쪽 채우기 ----------
  {
    const cand = [];
    for (let x = B.x0 + 40; x < B.x1 - 40; x += 26) for (let z = B.z0 + 40; z < B.z1 - 40; z += 26) cand.push([x + rr(-6, 6), z + rr(-6, 6)]);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const [x, z] of cand) {
      if (nBld >= maxB) break;
      const zk = zoneOf(x, z);
      if (terrainH(x, z) > 0.5) continue;
      // 가까운 도로 방향
      let ang = 0, bd = 1e9;
      for (const e of edgesNear(x, z)) { if (e.elevated) continue; const d = segDist(x, z, e.a.x, e.a.z, e.b.x, e.b.z); if (d < bd) { bd = d; ang = e.heading; } }
      if (bd > 260 && zk !== 'rural') continue;
      if (zk === 'apt') {
        if (R() < 0.15) continue;
        const w = rr(40, 56), d = 13, floors = 13 + Math.floor(R() * 15);
        if (!ogFree(x, z, w / 2 + 6, d / 2 + 12, ang)) continue;
        const h = floors * 2.8;
        building(mats.apt, x, z, ang, w, d, h, pick(aptColors, R), 10, 11.2);
        obox(stat, mats.roof, x, z, ang, w + 0.6, d + 0.6, h, h + 1.2, 0x9aa3a8);
        if (R() < 0.3) { const tex = textBoard([{ t: `${dongNo}동`, s: 0.8 }], { bg: 'rgba(0,0,0,0)', fg: '#4a5866', w: 256, h: 128, noBorder: true }); const dm = new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: tex, transparent: true })); dm.scale.set(10, 5, 1); dm.position.set(x - Math.sin(ang) * (d / 2 + 0.06), h - 3, z - Math.cos(ang) * (d / 2 + 0.06)); dm.rotation.y = ang + Math.PI; scene.add(dm); }
        dongNo++;
        ogMark(x, z, w / 2 + 6, d / 2 + 12, ang, 4);
        if (R() < 0.5) trees.push([x + Math.cos(ang) * (w / 2 + 4), 0.05, z - Math.sin(ang) * (w / 2 + 4), rr(0.9, 1.3)]);
      } else if (zk === 'cbd') {
        const w = rr(26, 40), d = rr(24, 36);
        if (!ogFree(x, z, w / 2 + 3, d / 2 + 3, ang)) continue;
        building(R() < 0.7 ? mats.office : mats.shop, x, z, ang, w, d, rr(25, 95), pick([0xffffff, 0xdfe8f0, 0xe6f0f2, 0xd6dde6], R), 12, 12);
      } else if (zk === 'ind') {
        const w = rr(40, 70), d = rr(26, 40);
        if (!ogFree(x, z, w / 2 + 4, d / 2 + 4, ang)) continue;
        building(mats.factory, x, z, ang, w, d, rr(8, 16), pick([0xd0d4d8, 0xb9c4cc, 0xe0dcd0, 0x9fb2c4], R));
      } else if (zk === 'mixed') {
        if (R() < 0.4) continue;
        const w = rr(10, 16), d = rr(10, 14);
        if (!ogFree(x, z, w / 2 + 2, d / 2 + 2, ang)) continue;
        building(mats.shop, x, z, ang, w, d, rr(6, 15), pick(shopColors, R));
      } else if (zk === 'park' || zk === 'campus') {
        if (ogFree(x, z, 2, 2, 0)) for (let t = 0; t < 3; t++) trees.push([x + rr(-10, 10), 0.05, z + rr(-10, 10), rr(0.9, 1.4)]);
      } else if (zk === 'rural') {
        const r = R();
        if (r < 0.05 && ogFree(x, z, 8, 7, ang)) { building(mats.shop, x, z, ang, 12, 9, rr(3.5, 5), pick([0xf2efe6, 0xe8e0d0, 0xdfe6e8], R)); stat.add(new THREE.ConeGeometry(1, 1, 4), mats.roof, mx(x, 6, z, 0, ang + Math.PI / 4, 0, 10, 2.6, 7.5), pick([0xb04a3a, 0x3a5fa0, 0x4a7a4a], R)); }
        else if (r < 0.09 && ogFree(x, z, 5, 16, ang)) { obox(stat, mats.vinyl, x, z, ang, 8, 30, 0, 3.2); ogMark(x, z, 5, 16, ang, 4); addOBox(x, z, 4, 15, ang, 'bld'); }
        else if (r < 0.2 && ogFree(x, z, 2, 2, 0)) trees.push([x, 0.05, z, rr(0.9, 1.5)]);
      }
    }
  }
  }
  // ---------- 가로수 ----------
  for (const wk of W.walks) {
    const e = wk.e;
    const zk = zoneOf((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2);
    if ((zk === 'rural' || zk === 'ind') && (e.n || 1) < 2) continue;
    for (let s = wk.s0 + 8; s < wk.s1 - 6; s += (e.n || 1) >= 2 ? 10 : 19) {
      const q = EP(e, s, wk.side * (e.hw + 1.3));
      if (!onAnyRoad(q.x, q.z, e)) trees.push([q.x, 0.15, q.z, rr(0.75, 1.05)]);
    }
  }
  progress(0.82, '버스 정류장을 세우는 중...');
  await tick();

  // ---------- 버스 노선 · 정류장 ----------
  buildRoutes(opts.extraRoutes || []);
  for (const st of W.stops) if (!st.name) st.name = stopNameFor(st.link);
  // 실제 버스 노선 (실제 정류장 순서 그대로) — 정류장 이름도 실제 이름
  stopDB = (GP && GP.stops) || null;
  if (GP && GP.routes) for (const r of GP.routes) registerRoute(realRoute(r));
  for (const st of W.stops) if (!st.name) st.name = stopNameFor(st.link);
  for (const st of W.stops) { buildShelter(st); st.sheltered = true; }
  W.buildShelter = buildShelter;
  // 실제 장소 (학교 · 쇼핑 · 빵집 · 병원 …) — 정류장 이름을 정한 뒤에 넣음
  if (GP && GP.pois) W.placeCount = addPlaces(GP.pois, '광주', lm);
  if (GP && GP.subway) addSubwayLines(GP.subway, 'gwangju');
  W.addPlace = lm;
  function buildShelter(st) {
    const L = st.link;
    const lat = L.median / 2 + L.n * LANE_W + L.edge.shoulder + 2.6;
    const c = LP(L, st.s - 2, lat);
    const g = new THREE.Group();
    g.position.set(c.x, 0.15, c.z);
    g.rotation.y = L.heading;
    const sm = new Merger();
    sm.add(GEO.box, mats.basic, mx(0, 2.6, 0, 0, 0, 0, 1.8, 0.12, 4.2), 0x2b3f55);
    for (const zz of [-2, 2]) for (const xx of [-0.8, 0.8]) sm.add(GEO.box, mats.basic, mx(xx, 1.3, zz, 0, 0, 0, 0.08, 2.6, 0.08), 0x2b3f55);
    // 뒷벽(보도 바깥쪽 = 오른쪽 = 로컬 -x)
    sm.add(GEO.box, mats.glassWall, mx(-0.82, 1.4, 0, 0, 0, 0, 0.03, 2.2, 4.0));
    sm.add(GEO.box, mats.basic, mx(-0.45, 0.5, 0, 0, 0, 0, 0.45, 0.08, 3.2), 0x8a6a4a);
    sm.build(g);
    const tb = textBoard([{ t: st.name, s: 0.55 }, { t: st.routes.slice(0, 6).join(' · ') || '시내버스', s: 0.38, w: 600 }], { bg: '#174ea6', w: 256, h: 96 });
    const sign = new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: tb, side: THREE.DoubleSide }));
    const sp = LP(L, st.s + 1.2, lat - 1.6);
    sign.scale.set(1.6, 0.6, 1); sign.position.set(sp.x, 3.0, sp.z); sign.rotation.y = L.heading + Math.PI;
    scene.add(sign);
    scene.add(g);
    signPoles.add(sp.x, 1.4, sp.z, 0, 0.05, 2.8, 0.05);
    if (!onAnyRoad(c.x, c.z, L.edge)) addOBox(c.x, c.z, 0.9, 2.1, L.heading, 'shelter');
    st.wait = LP(L, st.s - 0.5, lat - 1.2);
  }

  // ---------- 나무 ----------
  {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    W.mats.leaf = leafMat;
    const trunks = new Inst(GEO.cyl8, trunkMat);
    const crowns = new Inst(CROWN_GEO, leafMat);
    for (const [x, y, z, s] of trees) {
      if (OG.a && y < 1) { const i = Math.floor((x - OG.x0) / OG.cell), j = Math.floor((z - OG.z0) / OG.cell); const v = OG.a[j * OG.nx + i]; if (v === 4) continue; }
      if (waterAt(x, z)) continue;
      trunks.add(x, y + 1.7 * s, z, 0, 0.18 * s, 3.4 * s, 0.18 * s);
      const c = new THREE.Color().setHSL(0.25 + R() * 0.07, 0.5, 0.26 + R() * 0.1);
      crowns.add(x, y + 4.9 * s, z, R() * 6, 2.3 * s, 2.3 * s, 2.3 * s, c);
      if (y > 0.1 && y < 1) addCircle(x, z, 0.35, 'tree');
    }
    const cones = new Inst(new THREE.ConeGeometry(1, 1, 7), leafMat);
    for (const [x, y, z, s] of pines) {
      trunks.add(x, y + 1 * s, z, 0, 0.2 * s, 2 * s, 0.2 * s);
      const c = new THREE.Color().setHSL(0.3 + R() * 0.05, 0.4, 0.2 + R() * 0.08);
      cones.add(x, y + 5 * s, z, 0, 2.6 * s, 7.5 * s, 2.6 * s, c);
    }
    trunks.build(scene, { cast: true, far: 1300 });
    W.treeCrowns = crowns.build(scene, { cast: true, far: 1500 });
    W.pineCrowns = cones.build(scene, { cast: true, far: 1600 });
  }
  // ---------- 주차장 주차 차량 ----------
  for (const sp of W.parkedSpotsUsed || []) {
    const spec = pick(CARS, R);
    const car = buildCar(spec, { color: pick(['#eeeeec', '#121315', '#b5bac0', '#555b63', '#1c3a72'], R), lod: true });
    car.group.position.set(sp.x, ROADY, sp.z); car.group.rotation.y = sp.heading;
    scene.add(car.group);
    addBox(sp.x - spec.wid / 2, sp.z - spec.len / 2, sp.x + spec.wid / 2, sp.z + spec.len / 2, 'car');
  }
  progress(0.9, '마무리하는 중...');
  await tick();
  tris.build(scene, { planar: 8 });
  stat.build(scene, { cast: true, receive: true });
  bld.build(scene, { cast: true, receive: true });
  for (const k in marks) marks[k].build(scene, { receive: true, far: 700 });
  for (const k in arrowsI) arrowsI[k].build(scene, { receive: true, far: 500 });
  busTextI.build(scene, { receive: true, far: 500 });
  poles.build(scene, { cast: true, far: 1000 });
  lampArms.build(scene, { cast: true, far: 1000 });
  W.lampHeads = lampHeads.build(scene, { far: 1400 });
  signPoles.build(scene, { cast: true, far: 900 });
  boxes.build(scene, { cast: true, far: 1000 });
  for (const v in speedSigns) speedSigns[v].build(scene, { far: 600 });
  signMerge.forEach((s) => s.M.build(scene, { cast: false }));
  // 산길 (타임 트라이얼)
  {
    const es = W.edges.filter((e) => e.name === '증심사길');
    const pts = [];
    let n = W.anchorNode['학동'];
    const used = new Set();
    for (let k = 0; k < 400; k++) {
      const e = es.find((x) => !used.has(x) && (x.a === n || x.b === n));
      if (!e) break;
      used.add(e);
      const m = e.a === n ? e.b : e.a;
      for (let s = 0; s < e.len; s += 2.5) pts.push({ x: n.x + (m.x - n.x) * s / e.len, z: n.z + (m.z - n.z) * s / e.len });
      n = m;
    }
    W.curve = { pts, hw: 3.9, len: pts.length * 2.5 };
  }
  // ---------- 광주 → 서울 고속도로 (+ 천안분기점 → 대전) ----------
  if (W.osm && GH && GH.pts) {
    progress(0.97, '서울 · 대전 · 부산 · 대구 · 인천 가는 고속도로를 잇는 중...');
    await tick();
    const addHwy = (H, opts, meta) => {
      const net = addCorridorNetwork(H, opts);
      const c = initCorridor(H, scene, mats, net, meta);
      const reg = registerCorridor(c);
      W.tolls.push(...reg.tolls);
      W.zones.push(...reg.zones);
      for (const p of reg.places) lm(p.name, p.x, p.z, p.r, p.cat ? { cat: p.cat } : {});
      W.corridorSpawns = Object.assign(W.corridorSpawns || {}, reg.spawns);
      return net;
    };
    addHwy(GH, { endRegion: 'seoul' }, { id: 'main' });
    if (GD && GD.pts) addHwy(GD, { branch: true, endRegion: 'daejeon' }, {
      id: 'daejeon', toEnd: '대전', toStart: '천안 · 서울', endName: '대전 (회덕분기점)', endSign: ['대전 · 회덕분기점', '대전 시내 도로로 이어져요'],
      spawns: [['hw_dj_jc', 600, 1, '경부고속도로 · 천안분기점 (대전 방향)'], ['hw_dj_cheongju', 30000, 1, '경부고속도로 · 청주 (대전 방향)'], ['hw_dj_end', -500, -1, '경부고속도로 · 대전 (천안 · 서울 방향)']],
    });
    // 경부고속도로 신갈분기점 → 수원 · 안산 → 인천: 영동고속도로
    if (GI && GI.pts) addHwy(GI, { branch: true, endRegion: 'incheon' }, {
      id: 'incheon', toEnd: '인천', toStart: '신갈 · 서울', endName: '인천 (남동 · 서창)', endSign: ['인천', '인천 시내 도로로 이어져요'],
      spawns: [['hw_ic_jc', 600, 1, '영동고속도로 · 신갈분기점 (인천 방향)'], ['hw_ic_ansan', 26000, 1, '영동고속도로 · 안산 (인천 방향)'], ['hw_ic_end', -500, -1, '영동고속도로 · 인천 (신갈 · 서울 방향)']],
    });
    // 광주(담양분기점) → 남원 → 거창 → 고령 → 대구(성서): 광주대구 · 중부내륙지선고속도로
    if (GG && GG.pts) addHwy(GG, { side: true, endRegion: 'daegu' }, {
      id: 'daegu', toEnd: '대구', toStart: '광주', endName: '대구 (성서)', endSign: ['대구 · 성서', '대구 시내 도로로 이어져요'],
      spawns: [['hw_dg_gj', 400, 1, '광주대구고속도로 · 담양 (대구 방향)'], ['hw_dg_namwon', 45000, 1, '광주대구고속도로 · 남원 (대구 방향)'], ['hw_dg_geochang', 112000, 1, '광주대구고속도로 · 거창 (대구 방향)'], ['hw_dg_end', -600, -1, '중부내륙지선 · 대구 성서 (광주 방향)']],
    });
    // 광주(창평IC) → 순천 → 진주 → 창원 → 부산(사상): 호남 · 남해고속도로
    if (GB && GB.pts) addHwy(GB, { side: true, endRegion: 'busan' }, {
      id: 'busan', toEnd: '부산', toStart: '광주', endName: '부산 (사상 · 서부산)', endSign: ['부산 · 사상', '부산 시내 도로로 이어져요'],
      spawns: [['hw_bs_gj', 400, 1, '호남고속도로 · 창평IC (순천 · 부산 방향)'], ['hw_bs_suncheon', 72000, 1, '남해고속도로 · 순천분기점 (부산 방향)'], ['hw_bs_jinju', 138000, 1, '남해고속도로 · 진주 (부산 방향)'], ['hw_bs_changwon', 192000, 1, '남해고속도로 · 창원 (부산 방향)'], ['hw_bs_end', -600, -1, '남해고속도로 · 부산 서부산 (광주 방향)']],
    });
  }
  // 다른 도시: 처음엔 자리만 (가까이 가거나 그곳에서 출발할 때 지도를 받아 붙임)
  W.regionDefs = REGION_DEFS;
  W.pendingRoutes = REGION_DEFS.filter((d) => !d.loaded).flatMap((d) => regionRoutes(d, true));
  for (const d of REGION_DEFS) {
    d.B = { x0: -(d.bbox[1] - 126.885) * 91060, x1: -(d.bbox[0] - 126.885) * 91060, z0: (d.bbox[2] - 35.155) * 110950, z1: (d.bbox[3] - 35.155) * 110950 };
  }
  W.regionLoaded = (id) => !!(REGION_DEFS.find((d) => d.id === id) || {}).loaded;
  W.ensureRegion = (id) => {
    const def = REGION_DEFS.find((d) => d.id === id);
    if (!def) return Promise.resolve(false);
    if (def.promise) return def.promise;
    def.promise = (async () => {
      if (W.onRegion) W.onRegion(def, 'loading');
      const [data, extra] = await Promise.all([import(def.mod).then((m) => m.default), def.extra ? import(def.extra).then((m) => m.default).catch(() => null) : null]);
      appendNetworkOSM(data, id);
      if (extra && extra.pois) markSchoolZones(extra.pois, (e) => e.reg === id);
      for (const C of W.corridors || []) if (C.endRegion === id) joinCorridorEnd(C);
      initRegion(id, data, scene, mats, { name: def.name, tower: def.tower });
      for (const [name, lat, lon, r, cat] of def.places) { const p = toXZ(lat, lon); lm(name, p.x, p.z, r, cat ? { cat } : {}); }
      for (const k in def.spawns) { const sp = spawnAt(...def.spawns[k]); if (sp) W.spawns[k] = sp; else delete W.spawns[k]; }
      for (const R0 of regionRoutes(def)) { try { registerRoute({ ...R0, pts: R0.ll.map(([la, lo]) => { const p = toXZ(la, lo); return [p.x, p.z]; }) }); } catch (e) { console.warn('route', R0.id, e); } }
      for (const r of (extra && extra.routes) || []) { try { registerRoute({ ...realRoute(r), region: id, regionName: def.name }); } catch (e) { console.warn('route', r.id, e); } }
      for (const st of W.stops) { if (!st.name) st.name = stopNameFor(st.link); if (!st.sheltered && W.buildShelter) { W.buildShelter(st); st.sheltered = true; } }
      if (extra && extra.pois) addPlaces(extra.pois, def.name, lm);
      if (extra && extra.subway) addSubwayLines(extra.subway, id);
      def.extraData = extra;
      W._nameEdges = null;
      def.loaded = true;
      W.pendingRoutes = REGION_DEFS.filter((d) => !d.loaded).flatMap((d) => regionRoutes(d, true));
      if (W.onRegion) W.onRegion(def, 'loaded');
      return true;
    })().catch((e) => { console.warn('region', id, e); def.promise = null; if (W.onRegion) W.onRegion(def, 'error'); return false; });
    return def.promise;
  };
  buildSpawns();
  W.nBuildings = nBld;
  progress(1, '완료!');
}
function buildRoutesLater() { /* 노선은 랜드마크가 생긴 뒤(정류장 이름) 등록 */ }

// 실제 노선 자료 → 노선 정의 (정류장 순서대로 한 바퀴: 기점 → 회차 → 기점)
function realRoute(r) {
  return { type: r.type, id: r.id, name: r.name, dest: r.dest, company: r.company, real: true, loop: true, realStops: r.keys ? [...r.stops, ...r.stops.slice(0, -1).reverse()] : r.stops, keys: !!r.keys, stopDB: r.keys ? stopDB : null, color: ROUTE_COLORS[r.type], livery: BUS_TYPES[r.type].livery, express: BUS_TYPES[r.type].stopEvery > 1 };
}
// 지역 노선 정의 → 노선 자료 (지도를 받기 전에도 목록에 보이게)
function regionRoutes(def, withReal) {
  const real = withReal ? (def.real || []).map(([type, id, dest]) => ({ type, id, name: id, dest, company: def.id === 'seoul' ? 's_hg' : 'd_hb', ll: null, real: true, region: def.id, regionName: def.name, color: ROUTE_COLORS[type], livery: BUS_TYPES[type].livery, express: BUS_TYPES[type].stopEvery > 1 })) : [];
  return real.concat((def.routes || []).map(([type, id, name, dest, co, ll]) => ({ type, id, name, dest, company: co, ll, region: def.id, regionName: def.name, color: ROUTE_COLORS[type], livery: BUS_TYPES[type].livery, express: BUS_TYPES[type].stopEvery > 1 })));
}
// 어린이 보호구역 재질 (빨간 노면 · 표지판)
let SZM = null;
function schoolZoneMats() {
  if (SZM) return SZM;
  const tex = canvasTex(256, 310, (g, w, h) => {
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d42a2a'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = '900 50px "Noto Sans KR", sans-serif';
    g.fillText('어린이', w / 2, 74); g.fillText('보호구역', w / 2, 132);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, 222, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d42a2a'; g.lineWidth = 12; g.stroke();
    g.fillStyle = '#111'; g.font = '900 64px sans-serif'; g.fillText('30', w / 2, 245);
  });
  SZM = {
    red: new THREE.MeshStandardMaterial({ color: 0xb23a32, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    sign: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }),
  };
  return SZM;
}
// 가로수 수관: 덩어리 4개를 합친 뭉게뭉게한 모양 (인스턴스 하나로 그림)
function lumpyCrown() {
  const parts = [[0, 0, 0, 1, 1], [0.55, -0.2, 0.25, 0.7, 0], [-0.5, -0.15, -0.3, 0.72, 0], [0.05, 0.45, -0.1, 0.62, 0]];
  const pos = [], nor = [];
  for (const [x, y, z, r, d] of parts) {
    const g = new THREE.IcosahedronGeometry(r, d); g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i] + x, P[i + 1] + y, P[i + 2] + z); const k = Math.hypot(P[i], P[i + 1], P[i + 2]) || 1; nor.push(P[i] / k * 0.7 + N[i] * 0.3, P[i + 1] / k * 0.7 + N[i + 1] * 0.3, P[i + 2] / k * 0.7 + N[i + 2] * 0.3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const CROWN_GEO = lumpyCrown();
const CELL_TREE = { trunk: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), leaf: new THREE.MeshStandardMaterial({ color: 0x4a8236, roughness: 0.9 }), crownGeo: CROWN_GEO };
// ===================== 출발 위치 =====================
// 위도·경도 근처 도로의 오른쪽 차로, toward 방향을 향하도록
function spawnAt(lat, lon, tlat, tlon, label, lane = 1, road = null) {
  const p = toXZ(lat, lon), t = toXZ(tlat, tlon);
  const pickL = (useRoad, minor) => {
    let best = null, bd = 1e9;
    for (const L of W.links) {
      const e = L.edge;
      if (e.elevated || e.ramp || e.kind === 'ic' || e.bridge || e.tunnel) continue;
      if (useRoad && e.name !== road) continue;
      if (!minor && W.osm && e.osm >= 5) continue;
      if (Math.abs(L.from.x - p.x) > 1500 || Math.abs(L.from.z - p.z) > 1500) continue;
      const d = segDist(p.x, p.z, L.from.x, L.from.z, L.to.x, L.to.z);
      const dirOk = (t.x - p.x) * L.dir.x + (t.z - p.z) * L.dir.z > 0;
      const sc = d + (dirOk ? 0 : 60) + (L.s1 - L.s0 < 40 ? 50 : 0);
      if (sc < bd) { bd = sc; best = L; }
    }
    return best;
  };
  const L = (road && pickL(true, true)) || pickL(false, false) || pickL(false, true) || W.links.find((l) => !l.edge.elevated && !l.edge.ramp);
  if (!L) return null;
  const s = clamp((p.x - L.from.x) * L.dir.x + (p.z - L.from.z) * L.dir.z, L.s0 + 10, Math.max(L.s0 + 10, L.s1 - 20));
  const q = lanePos(L, Math.max(0, Math.min(lane, L.n - 1)), s);
  return { x: q.x, z: q.z, heading: L.heading, label, link: L };
}
function spawnHwy(name, label) {
  const names = name === '제2순환도로' ? [name, '2순환로'] : [name];
  // 평지 구간 우선 (고가 위에서 시작하면 층 판정이 꼬일 수 있음)
  let es = W.edges.filter((e) => names.includes(e.name) && e.len > 150 && !e.ramp && !e.elevated && !e.mtn);
  if (!es.length) es = W.edges.filter((e) => names.includes(e.name) && e.len > 150 && !e.ramp);
  if (!es.length) es = W.edges.filter((e) => e.kind === 'highway' && e.len > 150 && !e.ramp);
  if (!es.length) return null;
  const e = es[Math.floor(es.length / 3)];
  const L = e.fwd || W.links.find((l) => l.edge === e);
  const q = lanePos(L, Math.min(1, L.n - 1), L.s0 + 20);
  if (W.osm) label = label.replace(' (고가)', '');
  return { x: q.x, z: q.z, heading: L.heading, label, link: L, level: e.elevated ? 'hwy' : undefined, y: e.elevated ? linkY(L, L.s0 + 20) : undefined };
}
function buildSpawns() {
  const a = (k) => ANCH[k];
  W.spawns = {
    city: spawnAt(...a('금남로4가'), ...a('5·18광장'), '금남로 · 5·18민주광장 방향', 2),
    cityhall: spawnAt(...a('시청사거리'), ...a('시청'), '광주광역시청 앞 (상무지구)'),
    downtown: spawnAt(35.1505, 126.9168, ...a('금남로4가'), '충장로 골목'),
    terminal: spawnAt(...a('광천사거리'), ...a('임동'), '유스퀘어 광천터미널 앞'),
    bridge: spawnAt(...a('유촌'), ...a('광신대교'), '광신대로 · 영산강 광신대교 방향', 0),
    highway: spawnHwy('호남고속도로', '호남고속도로 (고가)'),
    xway: spawnHwy('제2순환도로', '제2순환도로 (고가)'),
    mountain: spawnAt(35.1318, 126.9400, ...a('증심사'), '증심사길 · 무등산 입구', 0, '증심사길'),
    coast: spawnAt(...a('각화'), ...a('충효'), '광주호로 (호숫길)', 0, '광주호로'),
    industrial: spawnAt(...a('하남'), ...a('수완'), '하남산업단지'),
    apartment: spawnAt(...a('봉선'), ...a('방림'), '봉선동 아파트 단지', 0),
    hyocheon: spawnAt(35.1040, 126.8700, 35.1060, 126.8760, '효천1지구 · 효천중앙로 (임암동)', 0, '효천중앙로'),
    hyocheon2: spawnAt(35.1015, 126.8880, 35.1030, 126.8955, '효천2지구 · 효우로 (행암동)', 0, '효우로'),
    parking: W.parkingArea ? { x: (W.parkingArea.x0 + W.parkingArea.x1) / 2, z: W.parkingArea.z0 + 30, heading: Math.PI / 2, label: '주차 연습장 (상무지구)' } : null,
    country: spawnAt(...a('도산'), ...a('평동'), '평동 들녘 시골길', 0),
    station: spawnAt(...a('송정공원'), ...a('송정역'), '광주송정역 앞'),
    gjstation: spawnAt(...a('전대정문'), ...a('광주역'), '광주역 · 전남대 방향'),
    airport: spawnAt(...a('공항입구'), 35.1300, 126.8100, '광주공항 가는 길', 0),
    chumdan: spawnAt(...a('첨단'), ...a('첨단2'), '첨단지구 · GIST 근처'),
    ugparking: UG ? { x: UG.ramp.x0 - 25, z: (UG.ramp.z0 + UG.ramp.z1) / 2, heading: Math.PI / 2, label: '지하주차장 입구' } : null,
  };
  // 실제 지도: 무등산 산길 타임 트라이얼 코스 (출발점 → 증심사)
  if (W.osm) {
    const sp = W.spawns.mountain, goal = W.anchorNode['증심사'];
    const seg = sp && goal ? pathLinks(sp.link.to, goal) : null;
    if (seg && seg.length) {
      const pts = [];
      for (const L of [sp.link, ...seg]) for (let s = L.s0; s < L.s1; s += 4) pts.push(lanePos(L, 0, s));
      if (pts.length > 60) W.curve = { pts, hw: 3.9, len: pts.length * 4 };
    }
    if (!W.curve) { const L = sp.link, pts = []; for (let s = L.s0; s < L.s1; s += 4) pts.push(lanePos(L, 0, s)); W.curve = { pts, hw: 3.9, len: pts.length * 4 }; }
  }
  if (W.corridorSpawns) Object.assign(W.spawns, W.corridorSpawns);
  // 아직 안 불러온 도시의 출발 위치: 자리 · 이름만 (고를 때 지도를 받아 진짜 자리로 바꿈)
  for (const d of REGION_DEFS) for (const k in d.spawns) {
    if (d.loaded) continue;
    const [lat, lon, tlat, tlon, label] = d.spawns[k], p = toXZ(lat, lon), t = toXZ(tlat, tlon);
    W.spawns[k] = { x: p.x, z: p.z, heading: Math.atan2(t.x - p.x, t.z - p.z), label, lazy: d.id };
  }
  for (const k in W.spawns) if (!W.spawns[k]) delete W.spawns[k];
  // 예전 저장 호환
  W.spawns.tunnel = W.spawns.mountain; W.spawns.underpass = W.spawns.downtown; W.spawns.rest = W.spawns.highway;
}
void toLL; void obNearest;
