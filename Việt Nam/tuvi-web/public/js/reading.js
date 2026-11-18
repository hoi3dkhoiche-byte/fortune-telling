/**
 * Module Luận Giải Lá Số Tử Vi Đẩu Số — Hệ Phái Thiên Kỷ
 * Tự động phân tích các dữ kiện thật từ engine theo phương pháp Ni Haixia (Nghe Hai Ha)
 */

export function generateReading(natalData) {
  if (!natalData) return null;
  const natal = natalData.displayNatal || natalData.natal;
  if (!natal) return null;

  const palaces = natal.palaces || [];
  const ming = palaces.find(p => p.isMingGong || p.isMingPalace || p.branch === natal.mingGongBranch);
  const shen = palaces.find(p => p.isBodyPalace || p.isShenGong || p.branch === natal.shenGongBranch);
  const facts = natalData.facts || [];

  // 1. Phân tích Cung Mệnh
  const mingStars = ming ? ming.stars : [];
  const mingMajor = mingStars.filter(s => s.type === 'major');
  const isMingVCD = mingMajor.length === 0;

  let mingOverview = '';
  if (isMingVCD) {
    mingOverview = `Cung Mệnh tại <strong>${ming?.branchLabelVi || ''}</strong> thuộc thế <strong>Vô Chính Diệu</strong> (không có chính tinh tọa thủ). Theo thuật số Thiên Kỷ, người Mệnh Vô Chính Diệu có tính linh hoạt, tư duy đa chiều, khả năng thích nghi cao và chịu ảnh hưởng mạnh mẽ từ cung xung chiếu đối diện.`;
  } else {
    const majorNames = mingMajor.map(s => `<strong>${s.labelVi || s.name}</strong> (${s.brightnessLabelVi || s.brightnessRaw || 'Đắc'})`).join(', ');
    mingOverview = `Cung Mệnh an tại cung <strong>${ming?.branchLabelVi || ''}</strong>, có chính tinh tọa thủ: ${majorNames}. Đây là hạt nhân định hình tính cách, tài năng và bản lĩnh cốt lõi của đương số trong suốt cuộc đời.`;
  }

  // 2. Phân tích Cung Thân (Hậu vận)
  let shenOverview = '';
  if (shen) {
    const shenPalaceName = shen.labelVi || shen.name;
    shenOverview = `Cung Thân đồng cung tại <strong>${shenPalaceName}</strong> (${shen.branchLabelVi}). Trong thuật số Thiên Kỷ, Thân là nơi thể hiện hành vi, chí hướng và kết quả nỗ lực từ tuổi trung niên trở đi (từ 30-35 tuổi). Thân cư <strong>${shenPalaceName}</strong> cho thấy trọng tâm đời người và phúc nghiệp hậu vận sẽ gắn liền mật thiết với lĩnh vực này.`;
  }

  // 3. Phân tích Tứ Hóa Bản Mệnh
  const sihuaList = [];
  palaces.forEach(p => {
    p.stars.forEach(s => {
      if (s.siHua || s.siHuaLabelVi) {
        sihuaList.push({
          star: s.labelVi || s.name,
          sihua: s.siHuaLabelVi || s.siHua,
          palace: p.labelVi || p.name,
          branch: p.branchLabelVi,
        });
      }
    });
  });

  // 4. Phân tích Ngũ Hành Cục
  const juName = natal.wuxingJuLabelVi || natal.wuxingJuName || 'Ngũ Hành Cục';

  // 5. Tổng hợp các đại hạn
  const daxianList = palaces
    .map(p => ({
      palace: p.labelVi || p.name,
      branch: p.branchLabelVi,
      range: p.daXianAge ? `${p.daXianAge[0]} - ${p.daXianAge[1]}` : (p.ages ? `${p.ages[0]} - ${p.ages[1]}` : '—'),
      stars: p.stars.filter(s => s.type === 'major').map(s => s.labelVi || s.name).join(', ') || 'Vô chính diệu',
    }))
    .sort((a, b) => {
      const startA = parseInt(a.range.split('-')[0]) || 0;
      const startB = parseInt(b.range.split('-')[0]) || 0;
      return startA - startB;
    });

  return {
    mingOverview,
    shenOverview,
    juName,
    sihuaList,
    daxianList,
    mingPalace: ming,
    shenPalace: shen,
  };
}
