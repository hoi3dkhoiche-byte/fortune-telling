/**
 * Giao thức giao tiếp API với server Thiên Kỷ
 * Xử lý chống race-condition và phân loại envelope lỗi/cần làm rõ
 */

let activeAbortController = null;
let currentRequestId = 0;

export async function fetchProfiles() {
  try {
    const res = await fetch('/api/profiles');
    if (!res.ok) throw new Error(`Lỗi tải cấu hình profiles: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error('fetchProfiles error:', err);
    throw err;
  }
}

export async function fetchSampleChart() {
  try {
    const res = await fetch('/api/sample');
    if (!res.ok) throw new Error(`Lỗi tải lá số mẫu: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error('fetchSampleChart error:', err);
    throw err;
  }
}

export async function computeNatalApi(birthInput, profileId, selectedScenario = null) {
  // Hủy request cũ đang chạy để tránh đè kết quả
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const requestId = ++currentRequestId;

  try {
    const payload = {
      birth: birthInput,
      profileId: profileId || 'thienky-candidate',
      ...(selectedScenario ? { selectedScenario } : {}),
    };

    const res = await fetch('/api/natal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: activeAbortController.signal,
    });

    const data = await res.json().catch(() => ({
      status: 'error',
      error: `Phản hồi không phải JSON hợp lệ (Mã HTTP: ${res.status})`,
    }));

    // Bỏ qua nếu có request mới hơn đã được phát đi
    if (requestId !== currentRequestId) {
      return { aborted: true };
    }

    return {
      httpStatus: res.status,
      data,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { aborted: true };
    }
    console.error('computeNatalApi error:', err);
    return {
      httpStatus: 0,
      data: {
        status: 'error',
        error: `Lỗi kết nối máy chủ: ${err.message}`,
      },
    };
  }
}
