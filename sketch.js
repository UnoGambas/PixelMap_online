// --- 0. Supabase 설정 (❗❗❗ 본인의 키로 변경하세요 ❗❗❗) ---
const SUPABASE_URL = 'https://zqedegbajhsehgziorog.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxZWRlZ2JhamhzZWhnemlvcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDM4NDksImV4cCI6MjA3ODUxOTg0OX0.PIXb9ZNB_wabtX4KH6cb89JqxDOpvNg-ibY9VlkR7g4';
const BUCKET_NAME = 'pixel_art'; // 1단계에서 만든 버킷 이름
const TABLE_NAME = 'treasures';   // 1단계에서 만든 테이블 이름
let supabase;

// --- 1. 전역 변수 ---
let currentMode = 'DRAW'; // 'DRAW' 또는 'EXPLORE'

// 에디터 변수 (간소화된 [C])
let editorCanvasSize = 16; // 16x16 픽셀 에디터
let editorPixelSize;
let editorGridData;
let editorCurrentColor;
let editorCanvasX, editorCanvasY, editorTotalSize; // 에디터 위치/크기

// 맵 변수 (간소화된 [B])
let TILE_SIZE = 64;   // 맵에 표시될 타일 크기
let MAP_WIDTH = 64;   // 맵 가로 타일 개수
let MAP_HEIGHT = 64;  // 맵 세로 타일 개수
let camX = 0, camY = 0;
let isDraggingMap = false;
let lastMouseX, lastMouseY;
let galleryItems = []; // { tileX, tileY, story, img }
let loadedImages = {}; // 이미지 중복 로드 방지 캐시

// UI 요소
let btnDrawMode, btnExploreMode;
let btnBlack, btnWhite, btnClear;
let inputStory;
let btnSave;
let statusMessage = "모드를 선택하세요.";

// --- 2. p5.js 핵심 함수 ---

function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth(); // 픽셀 아트가 깨끗하게 보이도록 설정

  // Supabase 클라이언트 초기화
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // 픽셀 에디터 초기화
  setupEditor();

  // UI 버튼 초기화
  setupUI();

  // '그리기' 모드로 시작
  setDrawMode();
}

function draw() {
  background(30); // 어두운 맵 배경

  if (currentMode === 'DRAW') {
    drawEditor(); // 에디터 UI 그리기
  } else if (currentMode === 'EXPLORE') {
    drawMap(); // 맵 그리기
  }

  drawStatus(); // 상단 상태 메시지 그리기
}

// --- 3. 모드 변경 및 UI 설정 ---

function setupUI() {
  // 모드 변경 버튼
  btnDrawMode = createButton('✏️ 그리기');
  btnDrawMode.position(10, 10);
  btnDrawMode.mousePressed(setDrawMode);

  btnExploreMode = createButton('🌍 탐험하기');
  btnExploreMode.position(btnDrawMode.x + btnDrawMode.width + 5, 10);
  btnExploreMode.mousePressed(setExploreMode);

  // --- 에디터 UI (초기에는 숨김) ---
  btnBlack = createButton('⬛ 검은색');
  btnBlack.mousePressed(() => { editorCurrentColor = color(0); });

  btnWhite = createButton('⬜ 흰색');
  btnWhite.mousePressed(() => { editorCurrentColor = color(255); });

  btnClear = createButton('✨ 지우기');
  btnClear.mousePressed(clearEditor);

  inputStory = createInput('');
  inputStory.attribute('placeholder', '스토리를 입력하세요...');
  inputStory.size(200);

  btnSave = createButton('저장하고 맵에 심기');
  btnSave.mousePressed(saveAndUpload);

  // 에디터 UI 위치 잡기 (setupEditor에서 계산된 위치 기반)
  positionEditorUI();
  toggleEditorUI(false); // 일단 모두 숨김
}

function setDrawMode() {
  currentMode = 'DRAW';
  toggleEditorUI(true); // 그리기 UI 표시
  statusMessage = "픽셀 에디터: 그림을 그리고 '저장' 버튼을 누르세요.";
  btnDrawMode.style('background-color', '#aaa');
  btnExploreMode.style('background-color', '#fff');
}

function setExploreMode() {
  currentMode = 'EXPLORE';
  toggleEditorUI(false); // 그리기 UI 숨김
  statusMessage = "탐험 모드: 맵을 드래그하고 아이템을 클릭하세요.";
  btnDrawMode.style('background-color', '#fff');
  btnExploreMode.style('background-color', '#aaa');
  loadTreasures(); // 맵에 들어갈 때마다 보물 목록 새로고침
}

// 그리기 UI 표시/숨김
function toggleEditorUI(show) {
  let style = show ? 'block' : 'none';
  btnBlack.style('display', style);
  btnWhite.style('display', style);
  btnClear.style('display', style);
  inputStory.style('display', style);
  btnSave.style('display', style);
}

// 에디터 UI 위치 계산
function positionEditorUI() {
  btnBlack.position(editorCanvasX, editorCanvasY + editorTotalSize + 10);
  btnWhite.position(btnBlack.x + btnBlack.width + 5, btnBlack.y);
  btnClear.position(btnWhite.x + btnWhite.width + 5, btnBlack.y);
  inputStory.position(editorCanvasX, btnBlack.y + btnBlack.height + 10);
  btnSave.position(inputStory.x, inputStory.y + inputStory.height + 10);
}

function drawStatus() {
  fill(255);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(14);
  text(statusMessage, 10, 45); // 버튼 아래에 표시
}

// --- 4. 에디터 함수 (간소화된 [C]) ---

function setupEditor() {
  // 에디터를 화면 중앙에 배치
  editorTotalSize = min(width, height) * 0.7; // 화면의 70% 크기
  editorPixelSize = editorTotalSize / editorCanvasSize;
  editorCanvasX = (width - editorTotalSize) / 2;
  editorCanvasY = (height - editorTotalSize) / 2;

  editorCurrentColor = color(0); // 기본 검은색
  
  // 16x16 그리드 데이터 초기화 (모두 흰색)
  editorGridData = Array(editorCanvasSize).fill(null).map(() => 
    Array(editorCanvasSize).fill(color(255))
  );

  // UI 위치 업데이트
  if (btnBlack) positionEditorUI(); 
}

// 에디터 캔버스 지우기
function clearEditor() {
  for (let r = 0; r < editorCanvasSize; r++) {
    for (let c = 0; c < editorCanvasSize; c++) {
      editorGridData[c][r] = color(255);
    }
  }
}

// 에디터 그리기
function drawEditor() {
  push();
  translate(editorCanvasX, editorCanvasY);
  // 픽셀 격자 그리기
  for (let r = 0; r < editorCanvasSize; r++) {
    for (let c = 0; c < editorCanvasSize; c++) {
      fill(editorGridData[c][r]);
      stroke(220); // 연한 격자선
      rect(c * editorPixelSize, r * editorPixelSize, editorPixelSize, editorPixelSize);
    }
  }
  pop();
}

// 에디터 캔버스에 픽셀 찍기
function drawOnEditor(px, py) {
  // 에디터 영역 안에서만 작동
  if (px < editorCanvasX || px > editorCanvasX + editorTotalSize || 
      py < editorCanvasY || py > editorCanvasY + editorTotalSize) {
    return;
  }
  
  // 마우스 위치를 그리드 좌표로 변환
  let col = floor((px - editorCanvasX) / editorPixelSize);
  let row = floor((py - editorCanvasY) / editorPixelSize);

  if (col >= 0 && col < editorCanvasSize && row >= 0 && row < editorCanvasSize) {
    editorGridData[col][row] = editorCurrentColor;
  }
}

// --- 5. 맵 함수 (간소화된 [B]) ---

function drawMap() {
  push();
  translate(-camX, -camY); // 카메라 위치만큼 맵 이동

  // 맵 배경 격자 (연하게)
  stroke(50);
  strokeWeight(1);
  for (let x = 0; x <= MAP_WIDTH * TILE_SIZE; x += TILE_SIZE) {
    line(x, 0, x, MAP_HEIGHT * TILE_SIZE);
  }
  for (let y = 0; y <= MAP_HEIGHT * TILE_SIZE; y += TILE_SIZE) {
    line(0, y, MAP_WIDTH * TILE_SIZE, y);
  }

  // 저장된 보물들 그리기
  for (let item of galleryItems) {
    if (item.img) {
      image(item.img, item.tileX * TILE_SIZE, item.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // 마우스 호버 효과
  let { tX, tY } = worldToTile(mouseX + camX, mouseY + camY);
  let hoveredItem = galleryItems.find(item => item.tileX === tX && item.tileY === tY);
  
  if (hoveredItem) {
    fill(255, 255, 0, 100); // 노란색 하이라이트
    noStroke();
    rect(tX * TILE_SIZE, tY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    cursor('pointer');
  } else {
    cursor(isDraggingMap ? 'grabbing' : 'grab');
  }

  pop();
}

// 화면 좌표(px)를 맵 타일 좌표(tX, tY)로 변환
function worldToTile(wx, wy) {
  let tX = floor(wx / TILE_SIZE);
  let tY = floor(wy / TILE_SIZE);
  return { tX, tY };
}

// --- 6. Supabase 연동 함수 (핵심 [A] + DB) ---

async function saveAndUpload() {
  statusMessage = "저장 중... 잠시만 기다려주세요...";

  // 1. 스토리 가져오기
  const story = inputStory.value();
  if (!story) {
    statusMessage = "오류: 스토리를 입력해야 합니다.";
    return;
  }

  // 2. 픽셀 그리드를 PNG Blob으로 변환
  const blob = await gridToBlob();
  if (!blob) {
    statusMessage = "오류: 이미지 변환 실패";
    return;
  }
  
  // 3. Supabase Storage에 업로드
  const filePath = `${Date.now()}_art.png`;
  const { data: storageData, error: storageError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, blob, {
      contentType: 'image/png',
      cacheControl: '3600'
    });

  if (storageError) {
    statusMessage = "Storage 업로드 실패: " + storageError.message;
    console.error(storageError);
    return;
  }

  // 4. 업로드된 파일의 Public URL 가져오기
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);
  
  const publicUrl = urlData.publicUrl;

  // 5. Supabase Database에 아이템 정보 저장
  const newItem = {
    image_url: publicUrl,
    story: story,
    tile_x: floor(random(MAP_WIDTH)),   // 맵의 무작위 위치에
    tile_y: floor(random(MAP_HEIGHT))
  };

  const { error: dbError } = await supabase
    .from(TABLE_NAME)
    .insert(newItem);

  if (dbError) {
    statusMessage = "Database 저장 실패: " + dbError.message;
    console.error(dbError);
    // (실패 시 Storage에 업로드된 파일을 삭제하는 롤백 로직이 필요하지만, '간단한' 구현을 위해 생략)
    return;
  }

  statusMessage = "저장 완료! '탐험하기' 모드에서 확인하세요.";
  clearEditor();
  inputStory.value('');
}

// DB에서 모든 보물 아이템 불러오기
async function loadTreasures() {
  statusMessage = "공동 지도에서 보물 불러오는 중...";
  
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*'); // 모든 아이템 가져오기

  if (error) {
    statusMessage = "보물 로드 실패: " + error.message;
    console.error(error);
    return;
  }

  galleryItems = []; // 목록 초기화

  // 각 아이템을 순회하며 이미지 로드 (캐시 확인)
  for (let item of data) {
    if (!item.image_url) continue;

    // 이미 로드된 이미지인지 확인
    if (loadedImages[item.image_url]) {
      galleryItems.push({
        tileX: item.tile_x,
        tileY: item.tile_y,
        story: item.story,
        img: loadedImages[item.image_url]
      });
    } else {
      // 새로 로드
      loadImage(item.image_url, img => {
        loadedImages[item.image_url] = img; // 캐시에 저장
        galleryItems.push({
          tileX: item.tile_x,
          tileY: item.tile_y,
          story: item.story,
          img: img
        });
      }, err => {
        console.error("이미지 로드 실패:", item.image_url, err);
      });
    }
  }
  
  statusMessage = `보물 ${data.length}개 로드 완료. 맵을 탐험하세요.`;
}

// 픽셀 그리드 데이터를 PNG Blob 객체로 변환 (비동기)
function gridToBlob() {
  return new Promise(resolve => {
    // p5.js의 createGraphics를 사용해 보이지 않는 캔버스 생성
    const offscreen = createGraphics(editorCanvasSize, editorCanvasSize);
    offscreen.noStroke();
    for (let r = 0; r < editorCanvasSize; r++) {
      for (let c = 0; c < editorCanvasSize; c++) {
        offscreen.fill(editorGridData[c][r]);
        offscreen.rect(c, r, 1, 1);
      }
    }
    // 캔버스 데이터를 Blob으로 변환
    offscreen.canvas.toBlob(blob => {
      resolve(blob);
    }, 'image/png');
  });
}

// --- 7. 마우스 입력 핸들러 ---

function mousePressed() {
  // UI 버튼 영역 클릭 시 p5.js 캔버스 이벤트 무시 (간단한 방식)
  if (mouseY < 70) {
    return;
  }
  
  if (currentMode === 'DRAW') {
    // '그리기' 모드에서는 에디터에 그림
    drawOnEditor(mouseX, mouseY);
  } else if (currentMode === 'EXPLORE') {
    // '탐험' 모드
    // 1. 아이템 클릭 확인
    let { tX, tY } = worldToTile(mouseX + camX, mouseY + camY);
    let clickedItem = galleryItems.find(item => item.tileX === tX && item.tileY === tY);
    
    if (clickedItem) {
      // 아이템을 클릭했으면: 스토리 보여주기
      alert(`[${tX}, ${tY}]에서 발견!\n\n${clickedItem.story}`);
    } else {
      // 빈 땅을 클릭했으면: 맵 드래그 시작
      isDraggingMap = true;
      lastMouseX = mouseX;
      lastMouseY = mouseY;
    }
  }
}

function mouseDragged() {
  if (currentMode === 'DRAW') {
    // UI 버튼 영역 클릭 시 p5.js 캔버스 이벤트 무시 (간단한 방식)
    if (mouseY < 70) return;
    drawOnEditor(mouseX, mouseY);
  } else if (currentMode === 'EXPLORE' && isDraggingMap) {
    // 맵 드래그
    let dx = mouseX - lastMouseX;
    let dy = mouseY - lastMouseY;
    
    camX -= dx;
    camY -= dy;
    
    // 카메라가 맵 밖으로 나가지 않도록 제한
    const maxCamX = MAP_WIDTH * TILE_SIZE - width;
    const maxCamY = MAP_HEIGHT * TILE_SIZE - height;
    camX = constrain(camX, 0, max(0, maxCamX)); // 맵이 화면보다 작을 경우 대비
    camY = constrain(camY, 0, max(0, maxCamY));
    
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}

function mouseReleased() {
  if (currentMode === 'EXPLORE') {
    isDraggingMap = false; // 맵 드래그 종료
  }
}

// 창 크기가 변경되면 캔버스와 에디터 크기 재조정
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupEditor(); // 에디터 크기 및 위치 재계산
  positionEditorUI(); // UI 버튼 위치 재조정
}