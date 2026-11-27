/**
 * Quản lý trạng thái trung tâm của ứng dụng Thiên Kỷ
 */

class AppState {
  constructor() {
    this.listeners = new Set();
    this.state = {
      currentView: 'input',      // 'input' | 'chart' | 'reading'
      currentNatal: null,        // Envelope dữ liệu lá số từ API hoặc file
      selectedBranch: null,      // Chi của cung đang chọn (0-11)
      isLoading: false,          // Đang gọi API
      error: null,               // Thông báo lỗi dạng chuỗi
      needsInfo: null,           // Đối tượng status: 'needs' nếu cần làm rõ
      showRelationLines: true,   // Bật/tắt vẽ đường quan hệ bằng SVG
      viewMode: 'grid',          // 'grid' | 'list' (trên mobile)
      profiles: {},              // Danh sách profile từ backend
      profileEvidence: {},       // Bằng chứng profile
      selectedProfileId: 'thienky-candidate',
      isSample: false,           // Đang xem lá số mẫu
      isImported: false,         // Đang xem lá số mở từ file JSON ngoài (chưa kiểm tra lại)
      userName: '',              // Tên người dùng hiển thị
      focusPalace: '',           // Mã cung trọng tâm khi chuyển sang màn Dữ kiện & Model
    };
  }

  getState() {
    return this.state;
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  selectPalace(branch) {
    if (branch < 0 || branch > 11) return;
    this.setState({ selectedBranch: branch });
  }

  setView(viewName) {
    if (['input', 'chart', 'reading'].includes(viewName)) {
      this.setState({ currentView: viewName });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  openReadingForPalace(palaceId = '') {
    this.setState({ focusPalace: palaceId || '', currentView: 'reading' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setViewMode(mode) {
    this.setState({ viewMode: mode });
  }

  toggleRelationLines() {
    this.setState({ showRelationLines: !this.state.showRelationLines });
  }
}

export const state = new AppState();
