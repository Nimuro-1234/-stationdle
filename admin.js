// 管理者パネルのHTMLを自動生成して画面に挿入する
const adminPanel = document.createElement('div');
adminPanel.id = 'admin-panel';
adminPanel.style.padding = '10px';
adminPanel.style.background = '#ffebee';
adminPanel.style.border = '2px solid #f44336';
adminPanel.style.marginBottom = '15px';

// パネルの中身
adminPanel.innerHTML = `
<b>🛠 管理者モード</b><br>
現在の答え: <span id="debug-ans-text"></span><br>
<input type="text" id="admin-custom-ans" placeholder="新しい答え(ひらがな)">
<button id="admin-set-btn">答えを強制変更</button>
`;

// headerタグのすぐ下にパネルを挿入する
document.querySelector('header').insertAdjacentElement('afterend', adminPanel);

// 現在の答えを表示
document.getElementById('debug-ans-text').textContent = todayStation.yomi;

// 変更ボタンが押されたときの処理
document.getElementById('admin-set-btn').addEventListener('click', () => {
  const newAns = document.getElementById('admin-custom-ans').value.trim();
  if(newAns !== '') {
    // 駅データを上書き
    todayStation.yomi = newAns;
    document.getElementById('debug-ans-text').textContent = todayStation.yomi;
    alert('答えを「' + todayStation.yomi + '」に変更しました！');
  }
});
