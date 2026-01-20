import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from 'react-router-dom';
import axios from 'axios';
import './App.css';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  ArcElement,
  Legend,
} from 'chart.js';
import { Radar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  ArcElement,
  Legend
);

// バックエンドAPIのURL
const API_URL = process.env.REACT_APP_API_URL;

// 認証コンテキスト
const AuthContext = createContext(null);

function App() {
  const [auth, setAuth] = useState({ token: localStorage.getItem('token'), user: null, isLoading: true });

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: API_URL,
    });
    instance.interceptors.request.use(config => {
      if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
      }
      return config;
    });
    return instance;
  }, [auth.token]);

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.token) {
        try {
          const res = await api.get('/me');
          setAuth(prev => ({ ...prev, user: res.data, isLoading: false }));
        } catch {
          // トークンが無効な場合
          localStorage.removeItem('token');
          setAuth({ token: null, user: null, isLoading: false });
        }
      } else {
        setAuth(prev => ({ ...prev, isLoading: false }));
      }
    };
    fetchUser();
  }, [auth.token, api]);

  const login = async (username, password) => {
    const res = await axios.post(`${API_URL}/login`, { username, password });
    localStorage.setItem('token', res.data.token);
    setAuth(prev => ({ ...prev, token: res.data.token }));
  };

  const register = async (username, password) => {
    await axios.post(`${API_URL}/register`, { username, password });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setAuth({ token: null, user: null, isLoading: false });
  };

  const authContextValue = { ...auth, api, login, register, logout };

  if (auth.isLoading) {
    return (
      <div className="loading-fullscreen">
        <p>サーバーを起動しています...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={authContextValue}>
      <Router>
        <div className="App">
          <AppHeader />
          <main className="quiz-container">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="*" element={<Navigate to="/quiz" />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

function QuizPage() {
  const { api, token } = useContext(AuthContext);
  // --- Stateの定義 ---
  const [quiz, setQuiz] = useState(null); // クイズデータ (id, stats, options)
  const [isLoading, setIsLoading] = useState(true); // ローディング状態
  const [error, setError] = useState(''); // エラーメッセージ
  const [result, setResult] = useState(null); // 答え合わせの結果
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [retryMode, setRetryMode] = useState(false); // 間違えた問題オプション
  const [difficulty, setDifficulty] = useState('normal'); // 難易度 (easy, normal, hard)

  // スコア管理用のState
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [userStats, setUserStats] = useState(null);

  // --- 関数の定義 ---

  // 新しいクイズを取得する非同期関数
  const fetchQuiz = async (region, retry) => {
    if (!region) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    try {
      // 通常・リトライモード問わず、同じエンドポイントを叩く（サーバー側で分岐）
      const response = await api.get(`/quiz?region=${region}&retry=${retry}`);
      setQuiz(response.data);
      // デバッグ用に取得したクイズ情報をコンソールに出力
      console.log("Fetched quiz data:", response.data);
    } catch (err) {
      setError('クイズの読み込みに失敗しました。サーバーが起動しているか確認してください。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // 選択肢がクリックされたときの処理
  const handleOptionClick = async (selectedName) => {
    if (result) return; // すでに回答済みの場合は何もしない

    try {
      const response = await api.post(`/answer`, {
        id: quiz.id,
        name: selectedName,
      });
      setResult(response.data); // 結果をStateに保存

      if (response.data.isCorrect) {
        setScore(prevScore => prevScore + 1);
      }
      setQuestionCount(prevCount => prevCount + 1);

    } catch (err) {
      setError('答え合わせに失敗しました。');
      console.error(err);
    }
  };

  // 「次の問題へ」ボタンが押されたときの処理
  const handleNextQuiz = () => {
    fetchQuiz(selectedRegion, retryMode);
  };

  // 「間違えた問題」モードで全問正解したかチェックする
  useEffect(() => {
    // retryModeがtrueで、userStatsが読み込まれ、間違えた問題数が0になったらモード選択に戻る
    // questionCount > 0 を条件に加えることで、初期表示時に発火するのを防ぐ
    const wrongAnswersCount = userStats && userStats.WrongAnswers ? JSON.parse(userStats.WrongAnswers).length : 0;
    if (retryMode && userStats && questionCount > 0 && wrongAnswersCount === 0) {
      alert('おめでとうございます！間違えた問題をすべてクリアしました！');
      handleCloseModal();
    }
  }, [userStats, retryMode, questionCount]);

  // スコアモーダルを閉じる処理
  const handleCloseModal = () => {
    setShowScoreModal(false);
    setScore(0);
    setQuestionCount(0);
    // 地方選択に戻る
    setSelectedRegion(null); 
    setQuiz(null);
  }

  // 地方が選択されたときの処理
  const handleRegionSelect = (region, retry, diff) => {
    setSelectedRegion(region);
    setDifficulty(diff);
    setRetryMode(retry);
    fetchQuiz(region, retry);
  }

  // --- useEffect ---

  // ユーザー統計情報を取得
  useEffect(() => {
    if (token) { // ログインしている場合のみ統計情報を取得
      const getStats = async () => {
        const res = await api.get('/stats');
        setUserStats(res.data);
      };
      getStats();
    }
  }, [questionCount, api, token]);

  // 10問ごとに正答率を表示する
  useEffect(() => {
    if (questionCount > 0 && questionCount % 10 === 0) {
      setShowScoreModal(true);
    }
  }, [questionCount]);

  // --- レンダリング ---

  const wrongAnswersCount = userStats && userStats.WrongAnswers ? JSON.parse(userStats.WrongAnswers).length : 0;

  return (
    !selectedRegion || !quiz ? (
      <RegionSelector onSelect={handleRegionSelect} stats={userStats} selectedDifficulty={difficulty} />
    ) : (
      <>
      <div className="quiz-header">
        <p className="question-counter">{retryMode ? `残り ${wrongAnswersCount} 問` : `${questionCount + 1} 問目`}</p>
        <button onClick={handleCloseModal} className="interrupt-button">中断して戻る</button>
      </div>

      {showScoreModal && (
        <ScoreModal 
          score={score} 
          questionCount={questionCount} 
          onClose={handleCloseModal} 
        />
      )}

      {isLoading && <p>クイズを読み込み中...</p>}
      {error && <p className="error-message">{error}</p>}
      
      {!isLoading && !error && quiz && !showScoreModal && (
        <>
          {/* 種族値グラフ表示エリア */}
          <StatsRadarChart stats={quiz.stats} />
          <HintDisplay quiz={quiz} difficulty={difficulty} />

          {/* 結果表示エリア */}
          {result && (
            <div className="result-area">
              {result.isCorrect ? (
                <p className="result-correct">🎉 正解！ 🎉</p>
              ) : (
                <p className="result-incorrect">
                  残念！ 正解は...
                </p>
              )}
              <h3>{result.correctPokemon.name}</h3>
              {result.correctPokemon.imageUrl && (
                <img
                  src={result.correctPokemon.imageUrl}
                  alt={result.correctPokemon.name}
                  className="pokemon-image"
                />
              )}
              <button onClick={handleNextQuiz} className="next-button">次の問題へ</button>
            </div>
          )}

          {/* 選択肢エリア (結果が表示されていないときだけ表示) */}
          {!result && (
            <div className="options-grid">
              {quiz.options.map((option) => (
                <button 
                  key={option} 
                  onClick={() => handleOptionClick(option)}
                  className="option-button"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
    )
  );
}

function HintDisplay({ quiz, difficulty }) {
  // useMemoをコンポーネントのトップレベルに移動
  const selectedHint = useMemo(() => {
    // 難易度'hard'の場合はヒントを返さない
    if (difficulty === 'hard') {
      return [];
    }

    // hints配列の生成をuseMemo内に移動
    const hints = [
      `高さ: ${quiz.height ? quiz.height.toFixed(1) : 0} m`,
      `重さ: ${quiz.weight ? quiz.weight.toFixed(1) : 0} kg`,
    ];

    if (difficulty === 'easy') {
      return hints; // かんたんモードでは全てのヒントを表示
    }
    // ふつうモードではランダムに1つ
    return [hints[quiz.id % hints.length]]; // ポケモンIDに基づいて決定的に選択
  }, [quiz.id, quiz.height, quiz.weight, difficulty]);

  if (difficulty === 'hard') {
    return null; // むずかしいモードではヒントなし
  }

  return (
    <div className="hint-area">
      {selectedHint.map(hint => (
        <p key={hint}>{hint}</p>
      ))}
    </div>
  );
}
// --- 子コンポーネント ---

function TotalStatsDisplay({ total }) {
  return <div className="total-stats">合計種族値: <strong>{total}</strong></div>;
}

function StatsRadarChart({ stats }) {
  // 1. グラフの「とくこう」と「すばやさ」の配置を逆にする
  const data = {
    labels: ['HP', 'こうげき', 'ぼうぎょ', 'すばやさ', 'とくぼう', 'とくこう'],
    datasets: [
      {
        label: '種族値',
        data: [
          stats.hp,
          stats.attack,
          stats.defense,
          stats.speed, // 順序を入れ替え
          stats.sp_defense,
          stats.sp_attack,
        ],
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
      },
    ],
  };

  const options = {
    scales: {
      r: {
        angleLines: {
          display: true,
        },
        suggestedMin: 0,
        suggestedMax: 200, // 最大値に合わせて調整
        ticks: {
          stepSize: 40, // 2. メモリを40ごとに変更
        },
        pointLabels: {
          // 各ラベルの下に数値を表示する
          callback: function (label, index) {
            const statValue = data.datasets[0].data[index];
            return [label, `(${statValue})`]; // 配列で返すと改行される
          },
          font: {
            size: 14,
            weight: 'bold', // ラベル全体を太字に
          },
        }
      },
    },
    plugins: {
      tooltip: {
        enabled: true,
      },
    },
    maintainAspectRatio: false,
  };

  const totalStats = stats.hp + stats.attack + stats.defense + stats.sp_attack + stats.sp_defense + stats.speed;

  return (
    <div className="chart-wrapper">
      <div className="chart-container"><Radar data={data} options={options} /></div>
      <TotalStatsDisplay total={totalStats} />
    </div>
  );
}

function ScoreModal({ score, questionCount, onClose }) {
  const accuracy = (score / questionCount) * 100;
  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>結果発表</h2>
        <p>{questionCount}問中 {score}問 正解！</p>
        <p>正答率: {accuracy.toFixed(1)}%</p>
        <button onClick={onClose} className="next-button">モードを選び直す</button>
      </div>
    </div>
  );
}

function RegionSelector({ onSelect, stats, selectedDifficulty }) {
  const regions = [
    { id: 'all', name: 'すべてのポケモン' },
    { id: 'kanto', name: 'カントー' },
    { id: 'johto', name: 'ジョウト' },
    { id: 'hoenn', name: 'ホウエン' },
    { id: 'sinnoh', name: 'シンオウ' },
    { id: 'unova', name: 'イッシュ' },
    { id: 'kalos', name: 'カロス' },
    { id: 'alola', name: 'アローラ' },
    { id: 'galar', name: 'ガラル' },
    { id: 'paldea', name: 'パルデア' },
    { id: 'regional', name: 'リージョン' },
    { id: 'mega', name: 'メガシンカ' },
    { id: 'gmax', name: 'ダイマックス' },
  ];

  const difficulties = [
    { id: 'easy', name: 'かんたん' },
    { id: 'normal', name: 'ふつう' },
    { id: 'hard', name: 'むずかしい' },
  ];

  const wrongAnswersCount = stats && stats.WrongAnswers ? JSON.parse(stats.WrongAnswers).length : 0;
  const { user } = useContext(AuthContext);

  return (
    <div className="region-selector">
      {user ? (
        <>
          <div className="user-stats-box">
            <h3>累計成績</h3>
            <StatsDoughnutChart stats={stats} regions={regions} />
          </div>
          {wrongAnswersCount > 0 && (
            <button
              onClick={() => onSelect('retry', true, selectedDifficulty)}
              className="option-button retry-button"
            >
              間違えた問題に再挑戦 ({wrongAnswersCount}問)
            </button>
          )}
        </>
      ) : (
        <div className="user-stats-box">
          <p>ログインすると、成績を記録したり、間違えた問題に再挑戦できます。</p>
          <Link to="/login">ログインはこちら</Link>
        </div>
      )}

      <h2>難易度を選択してください</h2>
      <div className="difficulty-selector">
        {difficulties.map(diff => (
          <button
            key={diff.id}
            onClick={() => onSelect(null, false, diff.id)} // 難易度だけ変更
            className={`difficulty-button ${selectedDifficulty === diff.id ? 'selected' : ''}`}
          >
            {diff.name}
          </button>
        ))}
      </div>

      <h2>モードを選択してください</h2>
      <div className="options-grid">
        {regions.map(region => (
          <button 
            key={region.id} 
            onClick={() => onSelect(region.id, false, selectedDifficulty)}
            className={`option-button ${region.id === 'all' ? 'all-pokemon-button' : ''}`}
          >
            {region.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatsDoughnutChart({ stats, regions }) {
  const [showRegional, setShowRegional] = useState(false);

  const totalCorrect = stats?.TotalCorrect || 0;
  const totalQuestions = stats?.TotalQuestions || 0;
  const totalIncorrect = totalQuestions - totalCorrect;

  const totalChartData = {
    labels: ['正解', '不正解'],
    datasets: [
      {
        data: [totalCorrect, totalIncorrect > 0 ? totalIncorrect : 0],
        backgroundColor: ['#4CAF50', '#F44336'],
        hoverBackgroundColor: ['#66BB6A', '#EF5350'],
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed !== null) {
              label += `${context.parsed}問`;
            }
            return label;
          },
        },
      },
    },
  };

  return (
    <div>
      <div className="chart-container-doughnut">
        <Doughnut data={totalChartData} options={chartOptions} />
      </div>
      <p>正答率: {totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : 'N/A'} %</p>
      <p>（{totalCorrect} / {totalQuestions} 問）</p>

      <button onClick={() => setShowRegional(!showRegional)} className="toggle-stats-button">
        {showRegional ? '隠す' : '地方別正答率を表示'}
      </button>

      {showRegional && (
        <div className="regional-stats">
          <div className="regional-charts-grid">
            {regions
              .map(regionInfo => {
                const regionData = stats?.RegionalStats?.[regionInfo.id] || { correct: 0, total: 0 };
                return { ...regionInfo, ...regionData };
              })
              .map(region => (
                <RegionalStatChart
                  key={region.id}
                  regionName={region.name}
                  correct={region.correct}
                  total={region.total}
                />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RegionalStatChart({ regionName, correct, total }) {
  const incorrect = total - correct;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

  const chartData = {
    labels: ['正解', '不正解'],
    datasets: [
      {
        data: [correct, incorrect > 0 ? incorrect : 0],
        backgroundColor: ['#4CAF50', '#F44336'],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
  };

  return (
    <div className="regional-chart-container">
      <Doughnut data={chartData} options={chartOptions} />
      <p className="regional-chart-label">{regionName}</p>
      <p className="regional-chart-accuracy">{accuracy}% ({correct}/{total})</p>
    </div>
  );
}

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/quiz');
    } catch (err) {
      setError('ログインに失敗しました。ユーザー名かパスワードを確認してください。');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>ログイン</h2>
      {error && <p className="error-message">{error}</p>}
      <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="ユーザー名" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" required />
      <button type="submit">ログイン</button>
      <p>アカウントがありませんか？ <Link to="/register">新規登録</Link></p>
    </form>
  );
}

function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!validPattern.test(username) || !validPattern.test(password)) {
      setError('ユーザー名とパスワードは、半角英数字を両方含む8文字以上で設定してください。');
      return;
    }
    try {
      await register(username, password);
      navigate('/login');
    } catch (err) {
      setError('このユーザー名は既に使用されています。');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>新規登録</h2>
      {error && <p className="error-message">{error}</p>}
      <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="ユーザー名 (半角英数字)" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード (半角英数字)" required />
      <button type="submit">登録</button>
      <p>既にアカウントをお持ちですか？ <Link to="/login">ログイン</Link></p>
    </form>
  );
}

function AppHeader() {
  const { user, logout } = useContext(AuthContext);
  return (
    <header className="App-header">
      <h1>種族値クイズ</h1>
      {user && (
        <div className="header-user-info">
          <span>{user.username}</span>
          <button onClick={logout}>ログアウト</button>
        </div>
      )}
    </header>
  );
}

export default App;
