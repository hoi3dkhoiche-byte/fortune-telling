const test = require('node:test');
const assert = require('node:assert/strict');

// Import logic partitionStars
const BAD_STAR_NAMES = new Set([
  'Kình Dương', 'Đà La', 'Hỏa Tinh', 'Linh Tinh', 'Địa Không', 'Địa Kiếp',
  'Thiên Khốc', 'Thiên Hư', 'Tang Môn', 'Bạch Hổ', 'Điếu Khách', 'Quan Phù',
  'Kiếp Sát', 'Thiên Diêu', 'Thiên Hình', 'Đại Hao', 'Tiểu Hao', 'Cô Thần',
  'Quả Tú', 'Bệnh Phù', 'Tử Phù', 'Phá Toái', 'Thiên Thương', 'Thiên Sứ',
  'Tuế Phá', 'Phi Liêm', 'Phục Binh', 'Hóa Kỵ',
]);

function partitionStars(stars) {
  const leftStars = [];
  const rightStars = [];

  stars.forEach(star => {
    const nameVi = star.labelVi || star.name;
    const isBad = BAD_STAR_NAMES.has(nameVi);
    const isSha = star.type === 'sha';
    const isJi = star.siHua === 'ji' || star.siHuaLabelVi === 'Hóa Kỵ';
    const isXian = star.brightnessRaw === 'xian' || star.brightnessRaw === '陷';

    if (isBad || isSha || isJi) {
      rightStars.push(star);
    } else if (star.type === 'major' && isXian) {
      rightStars.push(star);
    } else {
      leftStars.push(star);
    }
  });

  return { leftStars, rightStars };
}

test('partitionStars phân chia chính xác: Cát tinh bên trái, Sát tinh bên phải', () => {
  const samplePalaceStars = [
    { name: 'Tử Vi', labelVi: 'Tử Vi', type: 'major', brightnessRaw: 'miao' },
    { name: 'Thiên Phủ', labelVi: 'Thiên Phủ', type: 'major', brightnessRaw: 'wang' },
    { name: 'Kình Dương', labelVi: 'Kình Dương', type: 'sha', brightnessRaw: 'miao' },
    { name: 'Đà La', labelVi: 'Đà La', type: 'sha', brightnessRaw: 'xian' },
    { name: 'Tả Phụ', labelVi: 'Tả Phụ', type: 'lucky' },
    { name: 'Văn Xương', labelVi: 'Văn Xương', type: 'lucky', siHua: 'ke', siHuaLabelVi: 'Hóa Khoa' },
    { name: 'Hóa Kỵ', labelVi: 'Hóa Kỵ', siHua: 'ji', siHuaLabelVi: 'Hóa Kỵ' },
    { name: 'Địa Kiếp', labelVi: 'Địa Kiếp', type: 'sha' },
  ];

  const { leftStars, rightStars } = partitionStars(samplePalaceStars);

  const leftNames = leftStars.map(s => s.labelVi);
  const rightNames = rightStars.map(s => s.labelVi);

  // Bên trái: Cát tinh, Chính tinh tốt
  assert.ok(leftNames.includes('Tử Vi'));
  assert.ok(leftNames.includes('Thiên Phủ'));
  assert.ok(leftNames.includes('Tả Phụ'));
  assert.ok(leftNames.includes('Văn Xương'));

  // Bên phải: Sát tinh, Hóa Kỵ
  assert.ok(rightNames.includes('Kình Dương'));
  assert.ok(rightNames.includes('Đà La'));
  assert.ok(rightNames.includes('Địa Kiếp'));
  assert.ok(rightNames.includes('Hóa Kỵ'));
});
