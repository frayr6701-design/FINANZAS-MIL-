/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  orderBy,
  limit,
  Timestamp,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout, loginWithEmail, registerWithEmail } from './firebase';
import { 
  UserProfile, 
  Account, 
  Category, 
  Movement, 
  Goal, 
  WeeklyBudget,
  DashboardStats,
  MovementType,
  AccountType
} from './types';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  PieChart, 
  Wallet, 
  Target, 
  Plus, 
  LogOut, 
  LogIn,
  Bell,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  X,
  Settings,
  CreditCard,
  DollarSign,
  Smartphone,
  PiggyBank,
  Briefcase,
  CheckCircle2,
  Check,
  AlertCircle,
  Sun,
  Moon,
  BarChart as BarChartIcon,
  Sparkles,
  MessageSquare,
  Crown,
  ShieldCheck,
  User as UserIcon,
  ClipboardList,
  Trash2,
  Mail,
  Lock,
  UserPlus,
  History,
  RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, parseISO, subMonths, addMonths, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const PREDEFINED_CATEGORIES = [
  'comida', 'pasaje', 'ropa', 'internet', 'cuarto', 'móvil', 'inversión', 'ahorro', 'emergencia'
];

const ACCOUNT_ICONS: Record<string, any> = {
  'Efectivo': DollarSign,
  'Banco': CreditCard,
  'Digital': Smartphone,
  'Ahorro': PiggyBank,
  'Inversión': Briefcase
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [weeklyBudget, setWeeklyBudget] = useState<WeeklyBudget | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [movementModalType, setMovementModalType] = useState<MovementType>('expense');
  const [buttonAnimateKey, setButtonAnimateKey] = useState(0);
  const [showLoginToast, setShowLoginToast] = useState(false);

  // Manual Auth Session
  useEffect(() => {
    const savedUser = localStorage.getItem('manual_session');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setIsAuthReady(true);
    } else {
      setIsAuthReady(true);
    }
    setLoading(false);
  }, []);

  // Sync User Profile
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const fetchProfile = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
          const newProfile: UserProfile = {
            id: user.uid,
            name: user.name || user.username || 'Usuario',
            email: user.email || user.username || '',
            photoURL: user.photoURL || '',
            plan: 'basic'
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        } else {
          setUserProfile(docSnap.data() as UserProfile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();
  }, [user, isAuthReady]);

  const handleManualLogout = () => {
    localStorage.removeItem('manual_session');
    setUser(null);
    setUserProfile(null);
  };

  const handleResetApp = () => {
    setIsResetModalOpen(true);
  };

  const performReset = async () => {
    if (!user) return;
    
    try {
      // Collections to clean
      const collectionsToClean = ['movements', 'accounts', 'goals', 'weeklyBudgets', 'categories'];
      
      for (const collName of collectionsToClean) {
        const q = query(collection(db, collName), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
      
      // Reset user profile to default values
      if (userProfile) {
        const defaultProfile: UserProfile = {
          ...userProfile,
          totalBalance: 0,
          monthlyIncome: 0,
          monthlyExpenses: 0,
          savingsGoal: 0,
          currency: 'S/',
          lastUpdated: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', user.uid), defaultProfile);
        setUserProfile(defaultProfile);
      }
      
      setIsResetModalOpen(false);
      window.location.reload(); // Reload to clear all local states
    } catch (error) {
      console.error("Error resetting app:", error);
      alert("Hubo un error al reiniciar la aplicación.");
    }
  };

  const togglePlan = async () => {
    if (!user || !userProfile) return;
    const newPlan = userProfile.plan === 'basic' ? 'premium' : 'basic';
    try {
      await updateDoc(doc(db, 'users', user.uid), { plan: newPlan });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
    setUserProfile({ ...userProfile, plan: newPlan });
  };

  // Data listeners
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const qAccounts = query(collection(db, 'accounts'), where('userId', '==', user.uid));
    const unsubAccounts = onSnapshot(qAccounts, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    const qCategories = query(collection(db, 'categories'), where('userId', '==', user.uid));
    const unsubCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      if (cats.length === 0) {
        // Initialize predefined categories if none exist
        PREDEFINED_CATEGORIES.forEach(async (name) => {
          try {
            await addDoc(collection(db, 'categories'), { name, userId: user.uid });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'categories');
          }
        });
      } else {
        setCategories(cats);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    const qMovements = query(
      collection(db, 'movements'), 
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'movements');
    });

    const qGoals = query(collection(db, 'goals'), where('userId', '==', user.uid));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'goals');
    });

    const qBudget = query(collection(db, 'weeklyBudgets'), where('userId', '==', user.uid));
    const unsubBudget = onSnapshot(qBudget, (snapshot) => {
      if (!snapshot.empty) {
        setWeeklyBudget({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as WeeklyBudget);
      } else {
        setWeeklyBudget(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'weeklyBudgets');
    });

    return () => {
      unsubAccounts();
      unsubCategories();
      unsubMovements();
      unsubGoals();
      unsubBudget();
    };
  }, [user, isAuthReady]);

  // Dashboard Stats
  const stats = useMemo<DashboardStats>(() => {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const today = startOfDay(new Date());
    
    const todayMovements = movements.filter(m => isSameDay(parseISO(m.date), today));
    const dailyIncome = todayMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
    const dailyExpense = todayMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0);

    const monthStart = startOfMonth(new Date());
    const monthlyMovements = movements.filter(m => parseISO(m.date) >= monthStart);
    const monthlyIncome = monthlyMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
    const monthlyExpense = monthlyMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0);

    const weekStart = startOfWeek(new Date());
    const weeklyMovements = movements.filter(m => parseISO(m.date) >= weekStart);
    const weeklyIncome = weeklyMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
    const weeklyExpense = weeklyMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0);

    // Top category
    const catExpenses: Record<string, number> = {};
    movements.filter(m => m.type === 'expense').forEach(m => {
      catExpenses[m.categoryId] = (catExpenses[m.categoryId] || 0) + m.amount;
    });
    let topCatId = '';
    let maxExp = 0;
    Object.entries(catExpenses).forEach(([id, exp]) => {
      if (exp > maxExp) {
        maxExp = exp;
        topCatId = id;
      }
    });
    const topCategory = categories.find(c => c.id === topCatId)?.name || 'N/A';

    return { totalBalance, dailyIncome, dailyExpense, topCategory, weeklyIncome, weeklyExpense, monthlyIncome, monthlyExpense };
  }, [accounts, movements, categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={(u) => {
      setUser(u);
      setShowLoginToast(true);
      setTimeout(() => setShowLoginToast(false), 5000);
    }} />;
  }

  return (
    <div className={cn(
      "min-h-screen pb-24 font-sans transition-colors duration-300",
      darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      <AnimatePresence>
        {showLoginToast && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4"
          >
            <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-lg">
              <div className="bg-white/20 p-2 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">¡Bienvenido!</p>
                <p className="text-xs font-medium">Estás a un paso de tomar el control total de tus finanzas. 🚀</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className={cn(
        "px-4 pt-6 pb-4 sticky top-0 z-50 transition-all duration-300",
        darkMode ? "bg-slate-950/80 backdrop-blur-xl border-b border-slate-800" : "bg-white/80 backdrop-blur-xl border-b border-slate-100"
      )}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <Wallet className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className={cn("text-xl font-extrabold font-display leading-tight tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                Finanzas Mil <span className="text-indigo-600 italic">pro</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">Tu Asesor Personal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userProfile && (
              <button 
                onClick={togglePlan}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  userProfile.plan === 'premium' 
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                    : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
                )}
              >
                {userProfile.plan === 'premium' ? <Crown className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                {userProfile.plan === 'premium' ? 'Premium' : 'Básico'}
              </button>
            )}
            <button 
              onClick={handleResetApp}
              title="Reiniciar App"
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-95",
                darkMode ? "bg-slate-900 text-amber-400 hover:bg-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-95",
                darkMode ? "bg-slate-900 text-amber-400 hover:bg-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={handleManualLogout}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-95",
                darkMode ? "bg-slate-900 text-rose-400 hover:bg-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <DashboardView 
              movements={movements} 
              accounts={accounts} 
              categories={categories} 
              goals={goals}
              darkMode={darkMode} 
              stats={stats} 
              setActiveTab={setActiveTab} 
              onAddMovement={(type) => {
                setMovementModalType(type || 'expense');
                setIsMovementModalOpen(true);
              }} 
            />
          )}
          {activeTab === 'calendar' && <CalendarView movements={movements} accounts={accounts} categories={categories} darkMode={darkMode} />}
          {activeTab === 'stats' && <StatsView movements={movements} categories={categories} darkMode={darkMode} />}
          {activeTab === 'budget' && <WeeklyBudgetView budget={weeklyBudget} userId={user.uid} darkMode={darkMode} categories={categories} />}
          {activeTab === 'advisor' && <FinanceAdvisorView movements={movements} accounts={accounts} goals={goals} darkMode={darkMode} plan={userProfile?.plan || 'basic'} />}
          {activeTab === 'accounts' && <AccountsView accounts={accounts} userId={user.uid} darkMode={darkMode} />}
          {activeTab === 'goals' && <GoalsView goals={goals} userId={user.uid} darkMode={darkMode} />}
        </AnimatePresence>
      </main>

      {/* Floating Action Button */}
      <motion.button 
        key={buttonAnimateKey}
        onClick={() => setIsMovementModalOpen(true)}
        animate={buttonAnimateKey > 0 ? {
          scale: [1, 1.2, 1],
          rotate: [0, 15, -15, 0]
        } : {}}
        transition={{ duration: 0.5 }}
        className={cn(
          "fixed bottom-28 right-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white z-40",
          darkMode ? "shadow-lg shadow-indigo-500/20" : "shadow-lg shadow-indigo-200"
        )}
      >
        <Plus className="w-8 h-8" />
      </motion.button>

      {/* Bottom Navigation */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 border-t px-2 py-3 z-50 transition-colors duration-300",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="max-w-md mx-auto flex items-center justify-between gap-1">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={LayoutDashboard} label="Inicio" darkMode={darkMode} />
          <NavButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={CalendarIcon} label="Calendario" darkMode={darkMode} />
          <NavButton active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} icon={Target} label="Metas" darkMode={darkMode} />
          <NavButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={ClipboardList} label="Presupuesto" darkMode={darkMode} />
          <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={PieChart} label="Stats" darkMode={darkMode} />
          <NavButton active={activeTab === 'advisor'} onClick={() => setActiveTab('advisor')} icon={Sparkles} label="Asesor" darkMode={darkMode} />
          <NavButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} icon={Wallet} label="Cuentas" darkMode={darkMode} />
        </div>
      </nav>

      {/* Movement Modal */}
      <AnimatePresence>
        {isMovementModalOpen && (
          <MovementModal 
            onClose={() => setIsMovementModalOpen(false)} 
            onSuccess={() => setButtonAnimateKey(prev => prev + 1)}
            accounts={accounts} 
            categories={categories} 
            userId={user.uid}
            darkMode={darkMode}
            initialType={movementModalType}
          />
        )}
      </AnimatePresence>
      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <ResetConfirmationModal 
            onClose={() => setIsResetModalOpen(false)} 
            onConfirm={performReset}
            darkMode={darkMode} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Components ---

const ResetConfirmationModal = ({ onClose, onConfirm, darkMode }: { onClose: () => void, onConfirm: () => void, darkMode: boolean }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={cn(
          "w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl relative overflow-hidden",
          darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        )}
      >
        <div className="relative z-10 text-center space-y-6">
          <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          
          <div className="space-y-2">
            <h3 className={cn("text-2xl font-black font-display uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
              ¿Reiniciar App?
            </h3>
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              Esta acción es <span className="text-rose-500 font-black">IRREVERSIBLE</span>. Se borrarán todos tus movimientos, cuentas, metas y presupuestos.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => {
                setIsDeleting(true);
                onConfirm();
              }}
              disabled={isDeleting}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-rose-500/25 active:scale-95 disabled:opacity-50"
            >
              {isDeleting ? "Borrando todo..." : "SÍ, BORRAR TODO"}
            </button>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className={cn(
                "w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                darkMode ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              CANCELAR
            </button>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl -ml-16 -mb-16"></div>
      </motion.div>
    </motion.div>
  );
};

// --- Sub-components ---

function NavButton({ active, onClick, icon: Icon, label, darkMode }: { active: boolean, onClick: () => void, icon: any, label: string, darkMode: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all duration-300 relative py-1",
        active 
          ? "text-indigo-500 scale-105" 
          : darkMode ? "text-slate-500 hover:text-slate-400" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <Icon className={cn("w-6 h-6 transition-all", active ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute -bottom-3 w-1 h-1 bg-indigo-500 rounded-full"
        />
      )}
    </button>
  );
}

function MovementItem({ movement, categories, accounts, darkMode }: { movement: Movement, categories: Category[], accounts: Account[], darkMode: boolean, key?: string | number }) {
  const category = categories.find(c => c.id === movement.categoryId);
  const account = accounts.find(a => a.id === movement.accountOriginId);
  
  const isIncome = movement.type === 'income';
  const isTransfer = movement.type === 'transfer';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 group",
        darkMode ? "bg-slate-900/40 border-slate-800/50 hover:bg-slate-900 hover:border-indigo-500/30" : "bg-white border-slate-100 hover:border-indigo-100 shadow-sm"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-500 shadow-sm group-hover:scale-110",
          isIncome ? (darkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600") : 
          isTransfer ? (darkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600") : 
          (darkMode ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600")
        )}>
          {isIncome ? <TrendingUp className="w-5 h-5" /> : 
           isTransfer ? <ArrowRightLeft className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        </div>
        <div>
          <p className={cn("font-display font-black text-xl uppercase tracking-tight transition-colors", darkMode ? "text-slate-200" : "text-slate-900")}>
            {category?.name || (isTransfer ? 'Transferencia' : 'Sin categoría')}
          </p>
          <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em]">
            {movement.accountOriginId ? (account?.name || 'Cuenta eliminada') : 'Sin cuenta'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn(
          "font-display font-black text-lg transition-colors tracking-tighter",
          isIncome ? "text-emerald-500" : isTransfer ? "text-blue-500" : (darkMode ? "text-slate-100" : "text-slate-900")
        )}>
          {isIncome ? '+' : isTransfer ? '' : '-'}S/ {movement.amount.toLocaleString()}
        </p>
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.15em]">
          {format(parseISO(movement.date), 'dd MMM', { locale: es })}
        </p>
      </div>
    </motion.div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || !username || !password) return;
    setIsLoggingIn(true);
    setError(null);

    try {
      if (isRegistering) {
        // Check if user already exists
        const q = query(collection(db, 'manual_users'), where('username', '==', username.toLowerCase()));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          setError("Este usuario ya está registrado.");
          setIsLoggingIn(false);
          return;
        }

        const newUser = {
          username: username.toLowerCase(),
          password: password, // In a real app, this should be hashed
          name: username,
          createdAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, 'manual_users'), newUser);
        const sessionUser = { uid: docRef.id, ...newUser };
        localStorage.setItem('manual_session', JSON.stringify(sessionUser));
        onLogin(sessionUser);
      } else {
        // Login check
        const q = query(
          collection(db, 'manual_users'), 
          where('username', '==', username.toLowerCase()), 
          where('password', '==', password)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          setError("Usuario o contraseña incorrectos.");
        } else {
          const userData = snap.docs[0].data();
          const sessionUser = { uid: snap.docs[0].id, ...userData };
          localStorage.setItem('manual_session', JSON.stringify(sessionUser));
          onLogin(sessionUser);
        }
      }
    } catch (err: any) {
      console.error("Manual Auth error:", err);
      setError("Error de conexión con la base de datos.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (result?.user) {
        const sessionUser = { 
          uid: result.user.uid, 
          email: result.user.email, 
          name: result.user.displayName,
          photoURL: result.user.photoURL 
        };
        localStorage.setItem('manual_session', JSON.stringify(sessionUser));
        onLogin(sessionUser);
      }
    } catch (err: any) {
      setError("Error al iniciar sesión con Google.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center transition-colors duration-700 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]"></div>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/30 relative z-10"
      >
        <TrendingUp className="text-white w-10 h-10" />
      </motion.div>
      
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="relative z-10 w-full max-w-sm"
      >
        <h1 className="text-4xl font-extrabold font-display tracking-tighter text-slate-900 dark:text-white mb-2">
          Finanzas Mil <span className="text-indigo-600">pro</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto font-medium leading-relaxed">
          Gestiona tu libertad financiera con elegancia y precisión.
        </p>

        <div className="bg-white dark:bg-slate-900/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl mb-6">
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Nombre de Usuario</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Ej. milner03" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
                  required 
                />
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
                  required 
                />
              </div>
            </div>

            {error && (
              <p className="text-[10px] font-bold text-rose-500 bg-rose-500/10 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
            >
              {isLoggingIn ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : isRegistering ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  Crear Cuenta
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Iniciar Sesión
                </>
              )}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-2">
            <p className="text-[11px] text-slate-500">
              {isRegistering ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            </p>
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
              }}
              className="text-[11px] font-bold text-indigo-600 hover:underline"
            >
              {isRegistering ? 'Inicia Sesión' : 'Regístrate'}
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
              <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">O continuar con</span>
            </div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className={cn(
              "w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-xs",
              isLoggingIn && "opacity-70 cursor-not-allowed"
            )}
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" referrerPolicy="no-referrer" />
            Google
          </button>
        </div>
      </motion.div>
      
      <p className="mt-4 text-[10px] text-slate-400 font-medium tracking-wide relative z-10">
        Al continuar, aceptas nuestros términos y política de privacidad.
      </p>
    </div>
  );
}

function MovementModal({ onClose, accounts, categories, userId, darkMode, onSuccess, initialType }: { onClose: () => void, accounts: Account[], categories: Category[], userId: string, darkMode: boolean, onSuccess?: () => void, initialType?: MovementType }) {
  const [type, setType] = useState<MovementType>(initialType || 'expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountOriginId, setAccountOriginId] = useState('');
  const [accountDestinationId, setAccountDestinationId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    
    setIsSubmitting(true);
    try {
      const numAmount = parseFloat(amount);
      
      await runTransaction(db, async (transaction) => {
        // 1. READS
        let originData: Account | null = null;
        let originRef: any = null;
        if (accountOriginId) {
          originRef = doc(db, 'accounts', accountOriginId);
          const originSnap = await transaction.get(originRef);
          if (originSnap.exists()) originData = originSnap.data() as Account;
        }

        let destData: Account | null = null;
        let destRef: any = null;
        if (type === 'transfer' && accountDestinationId) {
          destRef = doc(db, 'accounts', accountDestinationId);
          const destSnap = await transaction.get(destRef);
          if (destSnap.exists()) destData = destSnap.data() as Account;
        }

        // 2. WRITES
        const movementRef = doc(collection(db, 'movements'));
        transaction.set(movementRef, {
          type,
          amount: numAmount,
          categoryId: type === 'transfer' ? '' : categoryId,
          accountOriginId: accountOriginId || '',
          accountDestinationId: (type === 'transfer' && accountDestinationId) ? accountDestinationId : '',
          date: new Date(date).toISOString(),
          note,
          userId
        });

        if (type === 'income' && originRef && originData) {
          transaction.update(originRef, { balance: originData.balance + numAmount });
        } else if (type === 'expense' && originRef && originData) {
          transaction.update(originRef, { balance: originData.balance - numAmount });
        } else if (type === 'transfer') {
          if (originRef && originData) {
            transaction.update(originRef, { balance: originData.balance - numAmount });
          }
          if (destRef && destData) {
            transaction.update(destRef, { balance: destData.balance + numAmount });
          }
        }
      });
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className={cn(
          "w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 space-y-4 transition-colors duration-300",
          darkMode ? "bg-slate-900" : "bg-white"
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black uppercase tracking-widest">Nuevo Movimiento</h2>
          <button onClick={onClose} className={cn(
            "p-2 rounded-full transition-colors",
            darkMode ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"
          )}><X className="w-5 h-5" /></button>
        </div>

        <div className={cn("flex p-1.5 rounded-2xl transition-colors", darkMode ? "bg-slate-800" : "bg-slate-100")}>
          <button 
            onClick={() => setType('expense')}
            className={cn("flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all", type === 'expense' ? (darkMode ? "bg-slate-700 text-rose-400 shadow-lg" : "bg-white shadow-md text-rose-600") : "text-slate-500")}
          >Gasto</button>
          <button 
            onClick={() => setType('income')}
            className={cn("flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all", type === 'income' ? (darkMode ? "bg-slate-700 text-emerald-400 shadow-lg" : "bg-white shadow-md text-emerald-600") : "text-slate-500")}
          >Ingreso</button>
          <button 
            onClick={() => setType('transfer')}
            className={cn("flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all", type === 'transfer' ? (darkMode ? "bg-slate-700 text-blue-400 shadow-lg" : "bg-white shadow-md text-blue-600") : "text-slate-500")}
          >Transf.</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Monto del Movimiento</label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-indigo-500 transition-transform group-focus-within:scale-110">S/</span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={cn(
                  "w-full border-none rounded-[2rem] py-6 pl-12 pr-6 text-4xl font-black font-display focus:ring-4 focus:ring-indigo-500/20 transition-all",
                  darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                )}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                {type === 'transfer' ? 'Origen (Opcional)' : 'Cuenta (Opcional)'}
              </label>
              <select 
                value={accountOriginId}
                onChange={(e) => setAccountOriginId(e.target.value)}
                className={cn(
                  "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-colors",
                  darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                )}
              >
                <option value="">Ninguna</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (S/ {a.balance})</option>)}
              </select>
            </div>

            {type === 'transfer' ? (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Destino (Opcional)</label>
                <select 
                  value={accountDestinationId}
                  onChange={(e) => setAccountDestinationId(e.target.value)}
                  className={cn(
                    "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-colors",
                    darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                  )}
                >
                  <option value="">Ninguna</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoría</label>
                <select 
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={cn(
                    "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-colors",
                    darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                  )}
                  required={type !== 'transfer'}
                >
                  <option value="">Seleccionar</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Fecha</label>
            <input 
              type="datetime-local" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(
                "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-colors",
                darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
              )}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nota (Opcional)</label>
            <input 
              type="text" 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="¿En qué gastaste?"
              className={cn(
                "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-colors",
                darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
              )}
            />
          </div>

          <button 
            disabled={isSubmitting}
            className={cn(
              "w-full py-4 rounded-2xl font-extrabold text-base shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3",
              type === 'expense' ? "bg-rose-600 text-white shadow-rose-500/20 hover:bg-rose-700" :
              type === 'income' ? "bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-700" :
              "bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700"
            )}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                {type === 'expense' ? <TrendingDown className="w-5 h-5" /> : 
                 type === 'income' ? <TrendingUp className="w-5 h-5" /> : <ArrowRightLeft className="w-5 h-5" />}
                <span className="uppercase tracking-widest">{type === 'expense' ? 'Confirmar Gasto' : type === 'income' ? 'Confirmar Ingreso' : 'Confirmar Transferencia'}</span>
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function WeeklyBudgetView({ budget, userId, darkMode, categories }: { budget: WeeklyBudget | null, userId: string, darkMode: boolean, categories: Category[] }) {
  const [income, setIncome] = useState(budget?.income || 0);
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenses, setExpenses] = useState(budget?.expenses || []);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (budget) {
      setIncome(budget.income);
      setExpenses(budget.expenses);
    }
  }, [budget]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = income - totalExpenses;

  // Group expenses by category name (or use the expense name if it matches a category)
  const categorySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    expenses.forEach(exp => {
      // We try to find if the expense name matches a category name
      // In handleAddExpense, if a category button is clicked, the name is the category name.
      const catName = categories.find(c => c.name === exp.name)?.name || exp.name;
      summary[catName] = (summary[catName] || 0) + exp.amount;
    });
    return Object.entries(summary).sort((a, b) => b[1] - a[1]);
  }, [expenses, categories]);

  const saveBudget = async (newIncome: number, newExpenses: { name: string, amount: number }[]) => {
    try {
      if (budget) {
        await updateDoc(doc(db, 'weeklyBudgets', budget.id), {
          income: newIncome,
          expenses: newExpenses
        });
      } else {
        await addDoc(collection(db, 'weeklyBudgets'), {
          income: newIncome,
          expenses: newExpenses,
          userId
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'weeklyBudgets');
    }
  };

  const handleAddExpense = (name?: string) => {
    const finalName = name || expenseName;
    if (!finalName || !expenseAmount) return;
    const newExpenses = [...expenses, { name: finalName, amount: parseFloat(expenseAmount) }];
    setExpenses(newExpenses);
    setExpenseName('');
    setExpenseAmount('');
    saveBudget(income, newExpenses);
  };

  const handleRemoveExpense = (index: number) => {
    const newExpenses = expenses.filter((_, i) => i !== index);
    setExpenses(newExpenses);
    saveBudget(income, newExpenses);
  };

  const handleIncomeChange = (val: string) => {
    const newIncome = parseFloat(val) || 0;
    setIncome(newIncome);
    saveBudget(newIncome, expenses);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), { name: newCategoryName.trim(), userId });
      setNewCategoryName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleRemoveCategory = async (catId: string) => {
    try {
      await deleteDoc(doc(db, 'categories', catId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className={cn("text-sm font-extrabold font-display tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>Presupuesto Semanal</h2>
          <p className="text-[8px] text-slate-500 font-medium uppercase tracking-wider">Planifica tus gastos</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
        </div>
      </div>

      {/* Income Card */}
      <div className={cn(
        "p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 block">Ingreso Semanal</label>
        <div className="flex items-center gap-3 relative z-10">
          <span className="text-2xl font-extrabold font-display text-emerald-500 tracking-tighter">S/</span>
          <input 
            type="number" 
            value={income || ''} 
            onChange={(e) => handleIncomeChange(e.target.value)}
            placeholder="0.00"
            className={cn(
              "text-3xl font-extrabold font-display bg-transparent border-none focus:ring-0 w-full p-0 tracking-tighter",
              darkMode ? "text-white" : "text-slate-900"
            )}
          />
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn(
          "p-4 rounded-xl border transition-all duration-300",
          darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        )}>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Gastos Totales</p>
          <p className="text-xl font-extrabold font-display text-rose-500 tracking-tighter">S/ {totalExpenses.toLocaleString()}</p>
        </div>
        <div className={cn(
          "p-4 rounded-xl border transition-all duration-300",
          darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        )}>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Saldo Restante</p>
          <p className={cn(
            "text-xl font-extrabold font-display tracking-tighter",
            remaining >= 0 ? "text-emerald-500" : "text-rose-500"
          )}>S/ {remaining.toLocaleString()}</p>
        </div>
      </div>

      {/* Category Summary (New Section) */}
      {categorySummary.length > 0 && (
        <div className={cn(
          "p-5 rounded-2xl border transition-all duration-300 space-y-3",
          darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        )}>
          <h3 className={cn("font-extrabold font-display text-lg tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Resumen por Categoría</h3>
          <div className="space-y-2">
            {categorySummary.map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-0">
                <span className={cn("text-sm font-bold", darkMode ? "text-slate-300" : "text-slate-600")}>{cat}</span>
                <span className={cn("text-lg font-extrabold font-display", darkMode ? "text-white" : "text-slate-900")}>S/ {amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Expense */}
      <div className={cn(
        "p-5 rounded-2xl border transition-all duration-300 space-y-4",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={cn("font-extrabold font-display text-xs tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Planificar Gasto</h3>
            <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">Selecciona una categoría</p>
          </div>
          <button 
            onClick={() => setIsManagingCategories(!isManagingCategories)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-50 text-slate-500"
            )}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {isManagingCategories ? (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Nueva categoría..." 
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className={cn(
                  "flex-1 py-2 px-4 rounded-lg border font-bold text-sm transition-all focus:ring-2 focus:ring-indigo-500",
                  darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              />
              <button 
                onClick={handleAddCategory}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <div 
                  key={cat.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-bold",
                    darkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"
                  )}
                >
                  <span>{cat.name}</span>
                  <button 
                    onClick={() => handleRemoveCategory(cat.id)}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleAddExpense(cat.name)}
                className={cn(
                  "px-3 py-2 rounded-md text-xs font-bold transition-all active:scale-95 border",
                  darkMode 
                    ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" 
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Nombre del gasto..." 
              value={expenseName}
              onChange={(e) => setExpenseName(e.target.value)}
              className={cn(
                "flex-1 py-3 px-4 rounded-lg border font-bold text-sm transition-all focus:ring-2 focus:ring-indigo-500",
                darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            />
            <input 
              type="number" 
              placeholder="Monto" 
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              className={cn(
                "w-24 py-3 px-4 rounded-lg border font-bold text-sm transition-all focus:ring-2 focus:ring-indigo-500",
                darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            />
          </div>
          <button 
            onClick={() => handleAddExpense()}
            className={cn(
              "w-full py-4 rounded-2xl font-extrabold text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3",
              darkMode ? "bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-500" : "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700"
            )}
          >
            <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <span className="uppercase tracking-widest">Agregar al Presupuesto</span>
          </button>
        </div>
      </div>

      {/* Expenses List */}
      <div className="space-y-3">
        <h3 className={cn("font-black font-display text-xl uppercase tracking-widest px-1 transition-colors", darkMode ? "text-white" : "text-slate-900")}>Gastos Planificados</h3>
        <div className="space-y-2">
          {expenses.map((exp, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "p-4 rounded-xl border flex items-center justify-between transition-all duration-300 group",
                darkMode ? "bg-slate-900 border-slate-800 hover:border-indigo-500/20" : "bg-white border-slate-100 shadow-sm hover:border-indigo-100"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className={cn("font-extrabold font-display text-sm tracking-tight transition-colors", darkMode ? "text-slate-200" : "text-slate-900")}>{exp.name}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Planificado</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className={cn("text-xl font-extrabold font-display tracking-tight transition-colors", darkMode ? "text-slate-100" : "text-slate-900")}>
                  S/ {exp.amount.toLocaleString()}
                </p>
                <button 
                  onClick={() => handleRemoveExpense(i)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors active:scale-90"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))}
          {expenses.length === 0 && (
            <div className={cn(
              "border border-dashed rounded-2xl p-8 text-center transition-colors",
              darkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-slate-400 text-xs font-medium">No hay gastos planificados</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinanceAdvisorView({ movements, accounts, goals, darkMode, plan }: { movements: Movement[], accounts: Account[], goals: Goal[], darkMode: boolean, plan: 'basic' | 'premium' }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const statsSummary = useMemo(() => {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.currentAmount >= g.targetAmount).length;
    const recentMovements = movements.slice(0, 5).map(m => `${m.type === 'income' ? '+' : '-'}S/ ${m.amount} (${m.date})`).join(', ');
    
    return `Saldo total: S/ ${totalBalance}. Metas: ${completedGoals}/${totalGoals}. Movimientos recientes: ${recentMovements}.`;
  }, [movements, accounts, goals]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    if (plan === 'basic' && messages.length >= 3) {
      alert("El plan básico solo permite 3 mensajes con el asesor. ¡Pásate a Premium para chats ilimitados!");
      return;
    }

    const userMsg = { role: 'user' as const, text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `Eres un asesor financiero experto para la app "Finanzas Mil pro". 
      Contexto del usuario: ${statsSummary}
      Responde de forma concisa, profesional y motivadora en español. 
      Pregunta del usuario: ${input}`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const modelMsg = { role: 'model' as const, text: result.text || "Lo siento, no pude procesar tu solicitud." };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Error with Gemini:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Hubo un error al conectar con el asesor. Por favor intenta de nuevo." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Asesor IA</h2>
          </div>
          {plan === 'basic' && (
            <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Plan Básico</span>
          )}
        </div>

      <div className={cn(
        "flex-1 overflow-y-auto p-3 rounded-2xl border space-y-2 transition-colors",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2 p-4">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className={cn("font-bold text-sm", darkMode ? "text-slate-200" : "text-slate-900")}>¿En qué puedo ayudarte?</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Pregúntame sobre tus ahorros</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn(
              "flex",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}>
              <div className={cn(
                "max-w-[85%] p-3 rounded-xl text-xs font-medium",
                msg.role === 'user' 
                  ? "bg-indigo-600 text-white rounded-tr-none" 
                  : darkMode ? "bg-slate-800 text-slate-200 rounded-tl-none" : "bg-slate-100 text-slate-800 rounded-tl-none"
              )}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className={cn(
              "p-3 rounded-xl text-sm font-medium animate-pulse",
              darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400"
            )}>
              Pensando...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Escribe tu consulta..."
          className={cn(
            "flex-1 py-3 px-4 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 transition-colors text-base font-medium",
            darkMode ? "bg-slate-900 text-white" : "bg-white text-slate-900 shadow-sm"
          )}
        />
        <button 
          onClick={handleSend}
          disabled={isTyping}
          className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-transform disabled:opacity-50"
        >
          <ArrowRightLeft className="w-5 h-5 rotate-90" />
        </button>
      </div>
    </div>
  );
}

function DashboardView({ movements, accounts, categories, goals, darkMode, stats, setActiveTab, onAddMovement }: { movements: Movement[], accounts: Account[], categories: Category[], goals: Goal[], darkMode: boolean, stats: DashboardStats, setActiveTab: (tab: string) => void, onAddMovement: (type?: MovementType) => void }) {
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-24"
    >
      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-4">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddMovement('expense')}
          className={cn(
            "group relative overflow-hidden p-5 rounded-[2.5rem] border transition-all duration-500 flex flex-col items-start gap-4",
            darkMode ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20" : "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-200"
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
            <TrendingDown className="text-white w-6 h-6" />
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black text-indigo-100 uppercase tracking-[0.3em] mb-1">NUEVO</p>
            <h4 className="text-xl font-black font-display text-white uppercase tracking-tight">REGISTRAR GASTO</h4>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700"></div>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddMovement('income')}
          className={cn(
            "group relative overflow-hidden p-6 rounded-[2.5rem] border transition-all duration-500 flex flex-col items-start gap-4",
            darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
          )}
        >
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", darkMode ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600")}>
            <TrendingUp className="w-7 h-7" />
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">NUEVO</p>
            <h4 className={cn("text-xl font-black font-display uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>REGISTRAR INGRESO</h4>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700"></div>
        </motion.button>
      </section>

      {/* Hero Balance Section */}
      <section className="text-center py-12">
        <p className="text-[14px] font-black text-slate-500 uppercase tracking-[0.5em] mb-4">Balance Total</p>
        <h2 className={cn(
          "text-6xl font-black font-display tracking-tighter transition-colors duration-300",
          darkMode ? "text-white" : "text-slate-900"
        )}>
          S/ {stats.totalBalance.toLocaleString()}
        </h2>
        <div className="flex items-center justify-center gap-8 mt-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <p className="text-xl font-black text-emerald-500 uppercase tracking-widest">+S/ {stats.monthlyIncome.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500"></div>
            <p className={cn("text-xl font-black uppercase tracking-widest", darkMode ? "text-rose-400" : "text-rose-500")}>-S/ {stats.monthlyExpense.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Goal Analytics Section */}
      <section className="grid grid-cols-2 gap-4">
        <div className={cn(
          "p-6 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Metas Cumplidas</p>
          <p className={cn("text-xl font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
            {goals.filter(g => g.currentAmount >= g.targetAmount).length}
          </p>
        </div>
        <div className={cn(
          "p-6 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4">
            <Target className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Total Ahorrado</p>
          <p className={cn("text-xl font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
            S/ {goals.reduce((sum, g) => sum + g.currentAmount, 0).toLocaleString()}
          </p>
        </div>
      </section>

      {/* Goals Summary Section */}
      {goals.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className={cn("font-black text-xl uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Metas Pro</h3>
            <button onClick={() => setActiveTab('goals')} className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em]">Ver Todas</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {goals.map(goal => {
              const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
              return (
                <motion.div 
                  key={goal.id}
                  whileHover={{ y: -5 }}
                  className={cn(
                    "min-w-[280px] p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden",
                    darkMode ? "bg-slate-900 border-slate-800 shadow-indigo-500/5" : "bg-white border-slate-100 shadow-sm"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      darkMode ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                    )}>
                      <Target className="w-5 h-5" />
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                      goal.priority === 'alta' ? "bg-rose-500/10 text-rose-500" : 
                      goal.priority === 'media' ? "bg-amber-500/10 text-amber-500" : 
                      "bg-emerald-500/10 text-emerald-500"
                    )}>
                      {goal.priority || 'media'}
                    </span>
                  </div>
                  <h4 className={cn("text-lg font-black font-display uppercase tracking-tight mb-1 truncate", darkMode ? "text-white" : "text-slate-900")}>{goal.name}</h4>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">{goal.category || 'General'}</p>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>{progress.toFixed(0)}%</span>
                      <span className="text-indigo-500">S/ {goal.targetAmount.toLocaleString()}</span>
                    </div>
                    <div className={cn("h-2 rounded-full overflow-hidden", darkMode ? "bg-slate-800" : "bg-slate-100")}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-indigo-600 rounded-full"
                      />
                    </div>
                  </div>
                  
                  {progress < 100 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGoal(goal);
                        setIsContributeModalOpen(true);
                      }}
                      className="mt-4 w-full py-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-600/20 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all active:scale-95"
                    >
                      Aportar
                    </button>
                  )}

                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12"></div>
                </motion.div>
              );
            })}
          </div>
          <AnimatePresence>
            {isContributeModalOpen && selectedGoal && (
              <GoalContributionModal 
                goal={selectedGoal} 
                onClose={() => { setIsContributeModalOpen(false); setSelectedGoal(null); }} 
                darkMode={darkMode} 
                userId={goals[0]?.userId || ''} 
              />
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Next Goal to Complete */}
      {goals.filter(g => g.currentAmount < g.targetAmount).length > 0 && (
        <section className="space-y-4">
          <h3 className={cn("font-black text-xl uppercase tracking-widest px-1 transition-colors", darkMode ? "text-white" : "text-slate-900")}>Próxima Meta</h3>
          {(() => {
            const nextGoal = [...goals]
              .filter(g => g.currentAmount < g.targetAmount)
              .sort((a, b) => {
                const progressA = a.currentAmount / a.targetAmount;
                const progressB = b.currentAmount / b.targetAmount;
                return progressB - progressA; // Highest progress first
              })[0];
            
            if (!nextGoal) return null;
            const progress = (nextGoal.currentAmount / nextGoal.targetAmount) * 100;
            
            return (
              <div className={cn(
                "p-6 rounded-[2.5rem] border transition-all duration-300 flex items-center justify-between relative overflow-hidden",
                darkMode ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20" : "bg-white border-slate-100 shadow-sm"
              )}>
                <div className="relative z-10">
                  <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] mb-2", darkMode ? "text-indigo-100" : "text-slate-500")}>Casi lo logras</p>
                  <h4 className={cn("text-2xl font-black font-display uppercase tracking-tight mb-1", darkMode ? "text-white" : "text-slate-900")}>{nextGoal.name}</h4>
                  <p className={cn("text-[11px] font-bold uppercase tracking-widest", darkMode ? "text-indigo-100/80" : "text-indigo-600")}>Faltan S/ {(nextGoal.targetAmount - nextGoal.currentAmount).toLocaleString()}</p>
                </div>
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full border-4 border-white/20 flex items-center justify-center relative">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="4" className={darkMode ? "text-white/10" : "text-slate-100"} />
                      <circle cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="4" strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - progress / 100)} className={darkMode ? "text-white" : "text-indigo-600"} />
                    </svg>
                    <span className={cn("absolute text-[10px] font-black", darkMode ? "text-white" : "text-slate-900")}>{progress.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Income/Expense Panels */}
      <section className="space-y-4">
        <h3 className={cn("font-black text-xl uppercase tracking-widest px-1 transition-colors", darkMode ? "text-white" : "text-slate-900")}>Resumen Financiero</h3>
        <div className="grid grid-cols-1 gap-4">
          {/* Today */}
          <div className={cn(
            "p-6 rounded-[2.5rem] border transition-all duration-300 flex items-center justify-between",
            darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
          )}>
            <div>
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Hoy</p>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Ingresos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {stats.dailyIncome.toLocaleString()}</p>
                </div>
                <div className="w-px h-12 bg-slate-800/50"></div>
                <div>
                  <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-1.5">Gastos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {stats.dailyExpense.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className={cn("w-16 h-16 rounded-[2rem] flex items-center justify-center", darkMode ? "bg-slate-800" : "bg-slate-50")}>
              <History className="w-8 h-8 text-indigo-500" />
            </div>
          </div>

          {/* Weekly */}
          <div className={cn(
            "p-6 rounded-[2.5rem] border transition-all duration-300 flex items-center justify-between",
            darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
          )}>
            <div>
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Esta Semana</p>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Ingresos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {stats.weeklyIncome.toLocaleString()}</p>
                </div>
                <div className="w-px h-12 bg-slate-800/50"></div>
                <div>
                  <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-1.5">Gastos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {stats.weeklyExpense.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className={cn("w-16 h-16 rounded-[2rem] flex items-center justify-center", darkMode ? "bg-slate-800" : "bg-slate-50")}>
              <TrendingUp className="w-8 h-8 text-emerald-500" />
            </div>
          </div>

          {/* Monthly */}
          <div className={cn(
            "p-6 rounded-[2.5rem] border transition-all duration-300 flex items-center justify-between",
            darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
          )}>
            <div>
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Este Mes</p>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Ingresos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {stats.monthlyIncome.toLocaleString()}</p>
                </div>
                <div className="w-px h-12 bg-slate-800/50"></div>
                <div>
                  <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-1.5">Gastos</p>
                  <p className={cn("text-3xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {stats.monthlyExpense.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className={cn("w-16 h-16 rounded-[2rem] flex items-center justify-center", darkMode ? "bg-slate-800" : "bg-slate-50")}>
              <PieChart className="w-8 h-8 text-amber-500" />
            </div>
          </div>
        </div>
      </section>

      {/* Quick Insights */}
      <section className="grid grid-cols-2 gap-4">
        <div className={cn(
          "p-6 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
            <PieChart className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Mayor Gasto</p>
          <p className={cn("text-xl font-black font-display uppercase truncate tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
            {stats.topCategory}
          </p>
        </div>
        <div className={cn(
          "p-6 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Ahorro Mes</p>
          <p className={cn("text-xl font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
            S/ {Math.max(0, stats.monthlyIncome - stats.monthlyExpense).toLocaleString()}
          </p>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className={cn("font-black text-xl uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Actividad Reciente</h3>
          <button onClick={() => setActiveTab('stats')} className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em]">Ver Todo</button>
        </div>
        <div className="space-y-3">
          {movements.slice(0, 5).map(m => (
            <MovementItem key={m.id} movement={m} categories={categories} accounts={accounts} darkMode={darkMode} />
          ))}
          {movements.length === 0 && (
            <div className={cn(
              "p-8 rounded-[2.5rem] border border-dashed text-center",
              darkMode ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No hay actividad reciente</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}

function CalendarView({ movements, accounts, categories, darkMode }: { movements: Movement[], accounts: Account[], categories: Category[], darkMode: boolean }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewingDate, setViewingDate] = useState<Date>(new Date());

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    const days = [];
    let curr = start;
    while (curr <= end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [selectedDate]);

  const dailyStats = useMemo(() => {
    const stats: Record<string, { income: number, expense: number }> = {};
    movements.forEach(m => {
      const dateKey = format(parseISO(m.date), 'yyyy-MM-dd');
      if (!stats[dateKey]) stats[dateKey] = { income: 0, expense: 0 };
      if (m.type === 'income') stats[dateKey].income += m.amount;
      if (m.type === 'expense') stats[dateKey].expense += m.amount;
    });
    return stats;
  }, [movements]);

  const movementsForDay = useMemo(() => {
    return movements.filter(m => isSameDay(parseISO(m.date), viewingDate));
  }, [viewingDate, movements]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-24"
    >
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className={cn("font-bold text-lg transition-colors", darkMode ? "text-white" : "text-slate-900")}>Calendario Financiero</h3>
          <div className="flex items-center gap-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{format(selectedDate, 'MMMM yyyy', { locale: es })}</p>
            <div className="flex gap-1">
              <button 
                onClick={() => setSelectedDate(subMonths(selectedDate, 1))}
                className={cn("p-1.5 rounded-lg transition-colors", darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
                className={cn("p-1.5 rounded-lg transition-colors", darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-[2.5rem] border transition-all duration-500",
          darkMode ? "bg-slate-900/40 border-slate-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
              <div key={`weekday-header-${i}`} className="text-center text-[9px] font-bold text-slate-500 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const stat = dailyStats[dateKey];
              const isSelected = isSameDay(day, viewingDate);
              const isToday = isSameDay(day, new Date());
              
              return (
                <button 
                  key={dateKey}
                  onClick={() => setViewingDate(day)}
                  className={cn(
                    "aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative",
                    isSelected 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110 z-10" 
                      : isToday 
                        ? (darkMode ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-indigo-50 text-indigo-600 border border-indigo-100")
                        : (darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-50 text-slate-600")
                  )}
                >
                  <span className="text-xs font-bold">{day.getDate()}</span>
                  <div className="flex gap-0.5">
                    {stat?.income > 0 && <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-emerald-500")}></div>}
                    {stat?.expense > 0 && <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-rose-500")}></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className={cn("font-bold text-lg transition-colors", darkMode ? "text-white" : "text-slate-900")}>
            {isSameDay(viewingDate, new Date()) ? 'Hoy' : format(viewingDate, "d 'de' MMMM", { locale: es })}
          </h3>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                +S/ {movementsForDay.filter(m => m.type === 'income').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
              <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">
                -S/ {movementsForDay.filter(m => m.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {movementsForDay.map(m => (
            <MovementItem key={m.id} movement={m} categories={categories} accounts={accounts} darkMode={darkMode} />
          ))}
          {movementsForDay.length === 0 && (
            <div className={cn(
              "text-center py-12 rounded-[2.5rem] border border-dashed transition-all duration-300",
              darkMode ? "bg-slate-900/20 border-slate-800 text-slate-600" : "bg-slate-50/50 border-slate-200 text-slate-400"
            )}>
              <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center mx-auto mb-3">
                <CalendarIcon className="w-6 h-6 opacity-20" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest">Sin actividad este día</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}

function StatsView({ movements, categories, darkMode }: { movements: Movement[], categories: Category[], darkMode: boolean }) {
  const pieData = useMemo(() => {
    const data: Record<string, number> = {};
    movements.filter(m => m.type === 'expense').forEach(m => {
      const cat = categories.find(c => c.id === m.categoryId)?.name || 'Otros';
      data[cat] = (data[cat] || 0) + m.amount;
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [movements, categories]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  const DARK_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee'];

  const barData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), i);
      return {
        name: format(d, 'MMM', { locale: es }),
        month: d.getMonth(),
        year: d.getFullYear(),
        income: 0,
        expense: 0
      };
    }).reverse();

    movements.forEach(m => {
      const date = parseISO(m.date);
      const monthData = last6Months.find(d => d.month === date.getMonth() && d.year === date.getFullYear());
      if (monthData) {
        if (m.type === 'income') monthData.income += m.amount;
        if (m.type === 'expense') monthData.expense += m.amount;
      }
    });

    return last6Months;
  }, [movements]);

  const totalIncome = useMemo(() => movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements]);
  const totalExpense = useMemo(() => movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements]);
  const balance = totalIncome - totalExpense;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Estadísticas</h2>
        <div className="flex gap-2">
          <div className="px-4 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            Pro Analytics
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={cn(
          "p-6 rounded-3xl border transition-all duration-300",
          darkMode ? "bg-slate-900 border-slate-800 shadow-indigo-500/5" : "bg-white border-slate-100 shadow-sm"
        )}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Ingresos</p>
          <p className="text-2xl font-extrabold font-display text-emerald-500 tracking-tighter">S/ {totalIncome.toLocaleString()}</p>
        </div>
        <div className={cn(
          "p-6 rounded-3xl border transition-all duration-300",
          darkMode ? "bg-slate-900 border-slate-800 shadow-indigo-500/5" : "bg-white border-slate-100 shadow-sm"
        )}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Gastos</p>
          <p className="text-2xl font-extrabold font-display text-rose-500 tracking-tighter">S/ {totalExpense.toLocaleString()}</p>
        </div>
        <div className={cn(
          "col-span-2 p-6 rounded-3xl border flex items-center justify-between transition-all duration-300",
          darkMode ? "bg-indigo-900/20 border-indigo-500/20" : "bg-indigo-50 border-indigo-100"
        )}>
          <div>
            <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Balance Neto</p>
            <p className={cn("text-3xl font-extrabold font-display tracking-tighter", balance >= 0 ? "text-emerald-500" : "text-rose-500")}>
              S/ {balance.toLocaleString()}
            </p>
          </div>
          <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center">
            <TrendingUp className="text-indigo-500 w-7 h-7" />
          </div>
        </div>
      </div>
      
      <div className={cn(
        "p-6 rounded-3xl border transition-all duration-300",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Gastos por Categoría</h3>
          <PieChart className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                paddingAngle={8}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`pie-cell-${entry.name}-${index}`} 
                    fill={darkMode ? DARK_COLORS[index % DARK_COLORS.length] : COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: darkMode ? '#1e293b' : '#fff', 
                  border: 'none', 
                  borderRadius: '16px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  color: darkMode ? '#f1f5f9' : '#1e293b'
                }}
                itemStyle={{ color: darkMode ? '#f1f5f9' : '#1e293b' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                iconType="circle"
                formatter={(value) => <span className={cn("text-xs font-medium", darkMode ? "text-slate-400" : "text-slate-600")}>{value}</span>}
              />
            </RePieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn(
        "p-6 rounded-3xl border transition-all duration-300",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Flujo de Caja (6 meses)</h3>
          <BarChartIcon className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#f1f5f9'} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: darkMode ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: darkMode ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }}
              />
              <Tooltip 
                cursor={{ fill: darkMode ? '#334155' : '#f8fafc', radius: 8 }}
                contentStyle={{ 
                  backgroundColor: darkMode ? '#1e293b' : '#fff', 
                  border: 'none', 
                  borderRadius: '16px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                }}
              />
              <Bar key="income-bar" dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} barSize={12} />
              <Bar key="expense-bar" dataKey="expense" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const AccountCard = ({ acc, darkMode, onDelete }: { acc: Account, darkMode: boolean, onDelete?: (id: string) => void }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const Icon = ACCOUNT_ICONS[acc.type] || Wallet;
  
  return (
    <div className={cn(
      "p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 group",
      darkMode ? "bg-slate-900 border-slate-800 hover:border-indigo-500/30" : "bg-white border-slate-100 shadow-sm hover:border-indigo-100"
    )}>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm" style={{ backgroundColor: `${acc.color}15`, color: acc.color }}>
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <p className={cn("text-xl font-black font-display uppercase transition-colors tracking-tight", darkMode ? "text-slate-200" : "text-slate-900")}>{acc.name}</p>
          <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em]">{acc.type}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!isDeleting ? (
          <>
            <p className={cn("text-lg font-black font-display transition-colors tracking-tighter", darkMode ? "text-slate-100" : "text-slate-900")}>
              S/ {acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </p>
            {onDelete && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeleting(true);
                }}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors active:scale-90"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleting(false);
              }}
              className="text-[10px] font-bold text-slate-500 uppercase hover:text-slate-700 transition-colors"
            >
              No
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(acc.id);
                setIsDeleting(false);
              }}
              className="px-3 py-1.5 bg-rose-600 text-white text-[10px] font-bold uppercase rounded-lg shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
            >
              Sí
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

function AccountsView({ accounts, userId, darkMode }: { accounts: Account[], userId: string, darkMode: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Efectivo');
  const [balance, setBalance] = useState('');
  const [color, setColor] = useState('#6366f1');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !balance) return;
    try {
      await addDoc(collection(db, 'accounts'), {
        name, type, balance: parseFloat(balance), color, userId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
    setIsModalOpen(false);
    setName(''); setBalance('');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'accounts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const bankAccounts = accounts.filter(acc => acc.type === 'Banco');
  const otherAccounts = accounts.filter(acc => acc.type !== 'Banco');

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Mis Cuentas</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Gestiona tus fuentes</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90",
          darkMode ? "bg-indigo-600 text-white shadow-indigo-900/40" : "bg-indigo-600 text-white shadow-indigo-200"
        )}>
          <Plus className="w-8 h-8" />
        </button>
      </div>

      {/* Bancos Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className={cn("font-extrabold font-display text-lg tracking-tight transition-colors", darkMode ? "text-slate-200" : "text-slate-800")}>Bancos</h3>
        </div>
        <div className="space-y-2">
          {bankAccounts.map(acc => (
            <div key={acc.id}>
              <AccountCard acc={acc} darkMode={darkMode} onDelete={handleDelete} />
            </div>
          ))}
          {bankAccounts.length === 0 && (
            <div className={cn(
              "border border-dashed rounded-2xl p-6 text-center transition-colors",
              darkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-slate-400 text-sm font-medium">No tienes cuentas bancarias registradas</p>
            </div>
          )}
        </div>
      </div>

      {/* Other Accounts Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <h3 className={cn("font-extrabold font-display text-lg tracking-tight transition-colors", darkMode ? "text-slate-200" : "text-slate-800")}>Otras Cuentas</h3>
        </div>
        <div className="space-y-2">
          {otherAccounts.map(acc => (
            <div key={acc.id}>
              <AccountCard acc={acc} darkMode={darkMode} onDelete={handleDelete} />
            </div>
          ))}
          {otherAccounts.length === 0 && (
            <div className={cn(
              "border border-dashed rounded-2xl p-6 text-center transition-colors",
              darkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-slate-400 text-sm font-medium">No hay otras cuentas registradas</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl transition-colors duration-300",
                darkMode ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-slate-900")}>Nueva Cuenta</h2>
                <button onClick={() => setIsModalOpen(false)} className={cn(
                  "p-1.5 rounded-full transition-colors",
                  darkMode ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
                )}><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleAdd} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Nombre</label>
                  <input type="text" placeholder="Ej. BCP Ahorros" value={name} onChange={e => setName(e.target.value)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-colors",
                    darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                  )} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Tipo de Cuenta</label>
                  <select value={type} onChange={e => setType(e.target.value as AccountType)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-colors",
                    darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                  )}>
                    {Object.keys(ACCOUNT_ICONS).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Saldo Inicial</label>
                  <input type="number" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-colors",
                    darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                  )} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Color</label>
                  <div className="flex gap-2 px-1">
                    {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                      <button key={c} type="button" onClick={() => setColor(c)} className={cn("w-6 h-6 rounded-full border-2 transition-all", color === c ? (darkMode ? "border-white scale-110" : "border-slate-900 scale-110") : "border-transparent hover:scale-105")} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <button className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 mt-2 active:scale-95 transition-transform text-xs">Crear Cuenta</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoalContributionModal({ goal, onClose, darkMode, userId }: { goal: Goal, onClose: () => void, darkMode: boolean, userId: string }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    try {
      const contribution = parseFloat(amount);
      await updateDoc(doc(db, 'goals', goal.id), {
        currentAmount: goal.currentAmount + contribution
      });
      
      // Optional: Create a movement for this contribution
      // For now we just update the goal
      
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "w-full max-w-md rounded-[2.5rem] p-8 space-y-6 shadow-2xl transition-colors duration-300",
          darkMode ? "bg-slate-900" : "bg-white"
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className={cn("text-xl font-black font-display uppercase tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>Aportar a Meta</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{goal.name}</p>
          </div>
          <button onClick={onClose} className={cn(
            "p-2 rounded-xl transition-colors",
            darkMode ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
          )}><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleContribute} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monto a Aportar</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-indigo-500">S/</span>
              <input 
                type="number" 
                placeholder="0.00" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                className={cn(
                  "w-full border-none rounded-2xl py-4 pl-10 pr-4 text-2xl font-black font-display focus:ring-2 focus:ring-indigo-500 transition-colors",
                  darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                )} 
                autoFocus
                required 
              />
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
              <span className="text-slate-500">Nuevo Progreso</span>
              <span className="text-indigo-500">
                {Math.min(100, ((goal.currentAmount + (parseFloat(amount) || 0)) / goal.targetAmount) * 100).toFixed(1)}%
              </span>
            </div>
            <div className={cn("h-2 rounded-full overflow-hidden", darkMode ? "bg-slate-800" : "bg-slate-100")}>
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((goal.currentAmount + (parseFloat(amount) || 0)) / goal.targetAmount) * 100)}%` }}
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Confirmar Aporte'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function GoalsView({ goals, userId, darkMode }: { goals: Goal[], userId: string, darkMode: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'baja' | 'media' | 'alta'>('media');
  const [category, setCategory] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');

  useEffect(() => {
    if (editingGoal) {
      setName(editingGoal.name);
      setTarget(editingGoal.targetAmount.toString());
      setCurrent(editingGoal.currentAmount.toString());
      setDeadline(editingGoal.deadline || '');
      setPriority(editingGoal.priority || 'media');
      setCategory(editingGoal.category || '');
      setIsModalOpen(true);
    }
  }, [editingGoal]);

  const handleAddOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !target) return;
    try {
      const goalData = {
        name, 
        targetAmount: parseFloat(target), 
        currentAmount: parseFloat(current || '0'), 
        deadline,
        priority,
        category,
        userId
      };

      if (editingGoal) {
        await updateDoc(doc(db, 'goals', editingGoal.id), goalData);
      } else {
        await addDoc(collection(db, 'goals'), goalData);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    }
    setIsModalOpen(false);
    setEditingGoal(null);
    setName(''); setTarget(''); setCurrent(''); setDeadline(''); setPriority('media'); setCategory('');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'goals', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'goals');
    }
  };

  const categoriesList = useMemo(() => {
    const cats = new Set(goals.map(g => g.category || 'General'));
    return ['Todas', ...Array.from(cats)];
  }, [goals]);

  const filteredGoals = useMemo(() => {
    if (filterCategory === 'Todas') return goals;
    return goals.filter(g => (g.category || 'General') === filterCategory);
  }, [goals, filterCategory]);

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Mis Metas Pro</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Planificación de alto nivel</p>
        </div>
        <button onClick={() => { setEditingGoal(null); setIsModalOpen(true); }} className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90",
          darkMode ? "bg-indigo-600 text-white shadow-indigo-900/40" : "bg-indigo-600 text-white shadow-indigo-200"
        )}>
          <Plus className="w-8 h-8" />
        </button>
      </div>

      {/* Goal Analytics Panel */}
      <section className={cn(
        "p-8 rounded-[2.5rem] border transition-all duration-300 relative overflow-hidden",
        darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      )}>
        <div className="relative z-10 flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Progreso Global</p>
            <h3 className={cn("text-4xl font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
              {overallProgress.toFixed(1)}%
            </h3>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Total Ahorrado</p>
            <p className="text-2xl font-black font-display text-indigo-500 tracking-tighter">S/ {totalSaved.toLocaleString()}</p>
          </div>
        </div>
        <div className={cn("h-4 rounded-full overflow-hidden mb-6", darkMode ? "bg-slate-800" : "bg-slate-100")}>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.3)]"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Activas</p>
            <p className={cn("text-lg font-black font-display", darkMode ? "text-white" : "text-slate-900")}>{goals.filter(g => g.currentAmount < g.targetAmount).length}</p>
          </div>
          <div className="text-center border-x border-slate-800/20">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Completadas</p>
            <p className={cn("text-lg font-black font-display text-emerald-500")}>{goals.filter(g => g.currentAmount >= g.targetAmount).length}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Pendiente</p>
            <p className={cn("text-lg font-black font-display text-rose-500")}>S/ {(totalTarget - totalSaved).toLocaleString()}</p>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
      </section>

      {/* Category Filter */}
      {categoriesList.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-1">
          {categoriesList.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                filterCategory === cat
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : darkMode ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-white text-slate-500 border border-slate-100 shadow-sm"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {filteredGoals.map(goal => {
          const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
          const isCompleted = progress >= 100;
          
          return (
            <motion.div 
              key={goal.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-6 rounded-[2.5rem] border shadow-sm space-y-6 transition-all duration-300 relative overflow-hidden group",
                darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                    darkMode ? "bg-indigo-900/40 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                  )}>
                    <Target className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={cn("text-xl font-black font-display uppercase tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>{goal.name}</h3>
                      {isCompleted && <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                        goal.priority === 'alta' ? "bg-rose-500/10 text-rose-500" : 
                        goal.priority === 'media' ? "bg-amber-500/10 text-amber-500" : 
                        "bg-emerald-500/10 text-emerald-500"
                      )}>
                        {goal.priority || 'media'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{goal.category || 'General'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setEditingGoal(goal)}
                    className={cn(
                      "p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100",
                      darkMode ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 text-slate-500 hover:text-indigo-600"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(goal.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100",
                      darkMode ? "bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white" : "bg-slate-50 text-rose-500 hover:bg-rose-50"
                    )}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 relative z-10">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Progreso</p>
                  <p className={cn("text-sm font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                    {progress.toFixed(0)}%
                  </p>
                </div>
                <div className={cn("h-3 rounded-full overflow-hidden transition-colors", darkMode ? "bg-slate-800" : "bg-slate-100")}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className={cn(
                      "h-full rounded-full shadow-[0_0_15px_rgba(79,70,229,0.4)]",
                      isCompleted ? "bg-emerald-500" : "bg-indigo-600"
                    )}
                  />
                </div>
                <div className="flex justify-between items-end pt-2">
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ahorrado</p>
                    <p className={cn("text-lg font-black font-display tracking-tighter", darkMode ? "text-indigo-400" : "text-indigo-600")}>
                      S/ {goal.currentAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Objetivo</p>
                    <p className={cn("text-lg font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                      S/ {goal.targetAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              
              {!isCompleted && (
                <button 
                  onClick={() => { setSelectedGoal(goal); setIsContributeModalOpen(true); }}
                  className="w-full py-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-600/20 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-95"
                >
                  Aportar a esta meta
                </button>
              )}

              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
            </motion.div>
          );
        })}
        {goals.length === 0 && (
          <div className={cn(
            "border border-dashed rounded-[2.5rem] p-12 text-center transition-colors",
            darkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
          )}>
            <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">No tienes metas registradas aún</p>
            <p className="text-slate-400 text-[10px] mt-2">Comienza a ahorrar para tus sueños hoy mismo</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "w-full max-w-md rounded-[2.5rem] p-8 space-y-6 shadow-2xl transition-colors duration-300",
                darkMode ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={cn("text-xl font-black font-display uppercase tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>
                    {editingGoal ? 'Editar Meta Pro' : 'Nueva Meta Pro'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuración avanzada</p>
                </div>
                <button onClick={() => { setIsModalOpen(false); setEditingGoal(null); }} className={cn(
                  "p-2 rounded-xl transition-colors",
                  darkMode ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
                )}><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleAddOrUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nombre de la Meta</label>
                    <input type="text" placeholder="Ej. Inversión Inmobiliaria" value={name} onChange={e => setName(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monto Objetivo</label>
                    <input type="number" placeholder="0.00" value={target} onChange={e => setTarget(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monto Actual</label>
                    <input type="number" placeholder="0.00" value={current} onChange={e => setCurrent(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Fecha Límite</label>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Prioridad</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}>
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Categoría</label>
                    <input type="text" placeholder="Ej. Viajes, Hogar, Retiro" value={category} onChange={e => setCategory(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-colors",
                      darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                </div>
                <button className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 mt-4 active:scale-95 transition-transform text-sm">
                  {editingGoal ? 'Guardar Cambios' : 'Crear Meta Pro'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isContributeModalOpen && selectedGoal && (
          <GoalContributionModal 
            goal={selectedGoal} 
            onClose={() => { setIsContributeModalOpen(false); setSelectedGoal(null); }} 
            darkMode={darkMode} 
            userId={userId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
