한판 HANPAN — HTML5 게임 묶음

[올리는 방법]
1. 이 폴더(hanpan_html5) 안의 파일을 전부 그대로 웹 서버(또는 게임 사이트)에 올리세요.
   맨 위의 index.html 이 한판 플랫폼 첫 화면이에요.
2. 게임 사이트(itch.io 등)에 올릴 때는 "HTML5 / 브라우저에서 실행"으로 고르고,
   이 폴더를 zip으로 묶어 올리면 index.html 이 첫 화면으로 열려요.
3. 내 컴퓨터에서 index.html 을 더블클릭(file://)하면 열리지 않아요.
   (게임이 자바스크립트 모듈을 써서 웹 서버가 필요해요.)
   내 컴퓨터에서 확인하려면 이 폴더에서:  python -m http.server 8000
   그다음 브라우저에서 http://localhost:8000 을 여세요.

[들어 있는 게임]
- roadkorea/   로드 코리아 (실제 지도 3D 운전 · 버스 · 기차/비행기 이동)
- corebreaker/ 코어 브레이커 (5대5 전술 슈팅)
- poparena/    팝 아레나 (3대3 탑뷰 난투)
- cubeland/    큐브랜드 (블록 샌드박스)
- lastisland/  라스트 아일랜드 (배틀로얄)
- duelstrike/  듀얼 스트라이크 (1대1 대전 격투)
- hanpanmini/  한판 미니 (가벼운 게임 5종)
- vendor/      공용 3D 엔진 (three.js r160, MIT 라이선스)

[참고]
- 인터넷이 없어도 돌아가게 3D 엔진을 함께 넣었어요. 로드 코리아의 도시 지도도 모두 들어 있어요.
- 온라인 대전(멀티플레이)은 이 버전에서는 꺼져 있어요. 봇 · 컴퓨터 대전 · 한 기기 둘이서는 돼요.
- 저장은 각 기기 브라우저(localStorage)에 돼요.
- 지도 데이터 © OpenStreetMap contributors (ODbL) · 타일 © OpenMapTiles / OpenFreeMap — 게임 안 표기를 지워선 안 돼요.
