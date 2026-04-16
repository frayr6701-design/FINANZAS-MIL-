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
  RecurringPayment,
  QuickAction,
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
  RefreshCcw,
  Edit3,
  Utensils,
  Bus,
  Coffee,
  ShoppingBag,
  Zap,
  Heart,
  Music,
  Table
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, parseISO, subMonths, addMonths, isAfter, addDays, getWeekOfMonth, getDay, eachDayOfInterval } from 'date-fns';
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

  const [calendarTargetDate, setCalendarTargetDate] = useState(new Date());
  const [calendarViewingDate, setCalendarViewingDate] = useState(new Date());

  // Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [weeklyBudget, setWeeklyBudget] = useState<WeeklyBudget | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [movementModalType, setMovementModalType] = useState<MovementType>('expense');
  const [buttonAnimateKey, setButtonAnimateKey] = useState(0);
  const [showLoginToast, setShowLoginToast] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
      const collectionsToClean = ['movements', 'accounts', 'goals', 'weeklyBudgets', 'categories', 'quickActions'];
      
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

  const handleDeleteMovement = async (movement: Movement) => {
    if (!user || !movement.id) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const movementRef = doc(db, 'movements', movement.id!);
        const movementSnap = await transaction.get(movementRef);
        if (!movementSnap.exists()) return;
        
        const mData = movementSnap.data() as Movement;
        const { type, amount, accountOriginId, accountDestinationId } = mData;

        // Revert balance for origin account
        if (accountOriginId) {
          const originRef = doc(db, 'accounts', accountOriginId);
          const originSnap = await transaction.get(originRef);
          if (originSnap.exists()) {
            const originData = originSnap.data() as Account;
            if (type === 'income') {
              transaction.update(originRef, { balance: originData.balance - amount });
            } else if (type === 'expense' || type === 'transfer') {
              transaction.update(originRef, { balance: originData.balance + amount });
            }
          }
        }

        // Revert balance for destination account (if transfer)
        if (type === 'transfer' && accountDestinationId) {
          const destRef = doc(db, 'accounts', accountDestinationId);
          const destSnap = await transaction.get(destRef);
          if (destSnap.exists()) {
            const destData = destSnap.data() as Account;
            transaction.update(destRef, { balance: destData.balance - amount });
          }
        }

        transaction.delete(movementRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `movements/${movement.id}`);
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
      setCategories(cats);
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

    const qRecurring = query(collection(db, 'recurringPayments'), where('userId', '==', user.uid));
    const unsubRecurring = onSnapshot(qRecurring, (snapshot) => {
      setRecurringPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringPayment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'recurringPayments');
    });

    const qQuickActions = query(collection(db, 'quickActions'), where('userId', '==', user.uid));
    const unsubQuickActions = onSnapshot(qQuickActions, (snapshot) => {
      if (snapshot.empty) {
        // Initialize default quick actions if none exist
        const defaults = [
          { label: 'Comida', amount: 15.00, icon: 'Utensils', userId: user.uid },
          { label: 'Pasaje', amount: 1.50, icon: 'Bus', userId: user.uid },
          { label: 'Gastos Hormiga', amount: 5.00, icon: 'Coffee', userId: user.uid }
        ];
        defaults.forEach(async (d) => {
          await addDoc(collection(db, 'quickActions'), d);
        });
      } else {
        setQuickActions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuickAction)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'quickActions');
    });

    return () => {
      unsubAccounts();
      unsubCategories();
      unsubMovements();
      unsubGoals();
      unsubBudget();
      unsubRecurring();
      unsubQuickActions();
    };
  }, [user, isAuthReady]);

  // Notification Logic
  useEffect(() => {
    if (recurringPayments.length === 0) return;
    
    const checkDuePayments = () => {
      const now = new Date();
      const due = recurringPayments.filter(p => !p.isPaid && isAfter(now, parseISO(p.dueDate)));
      
      if (due.length > 0) {
        // Play notification sound
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
        
        // Show browser notification if permitted
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Recordatorio de Pago", {
            body: `Tienes ${due.length} pago(s) pendiente(s): ${due.map(d => d.name).join(', ')}`,
            icon: '/favicon.ico'
          });
        }
      }
    };

    // Request permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const interval = setInterval(checkDuePayments, 60000); // Check every minute
    checkDuePayments(); // Initial check
    
    return () => clearInterval(interval);
  }, [recurringPayments]);
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

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weeklyMovements = movements.filter(m => parseISO(m.date) >= weekStart);
    const weeklyIncome = weeklyMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
    const weeklyExpense = weeklyMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0);

    const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
    const lastMonthEnd = endOfMonth(subMonths(new Date(), 1));
    const lastMonthMovements = movements.filter(m => {
      const d = parseISO(m.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
    const lastMonthIncome = lastMonthMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0);
    const lastMonthExpense = lastMonthMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0);

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

    // Weekly category breakdown - Only include categories with movements
    const weeklyCategoryExpenses = categories.map(cat => {
      const amount = weeklyMovements
        .filter(m => m.type === 'expense' && m.categoryId === cat.id)
        .reduce((sum, m) => sum + m.amount, 0);
      return {
        categoryId: cat.id,
        name: cat.name,
        amount
      };
    }).filter(cat => cat.amount > 0).sort((a, b) => b.amount - a.amount);

    return { totalBalance, dailyIncome, dailyExpense, topCategory, weeklyIncome, weeklyExpense, monthlyIncome, monthlyExpense, lastMonthIncome, lastMonthExpense, weeklyCategoryExpenses };
  }, [accounts, movements, categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
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
      "min-h-screen pb-24 font-sans transition-colors duration-500 relative overflow-hidden",
      darkMode ? "bg-mesh-dark text-slate-100" : "bg-mesh-light text-slate-900"
    )}>
      {/* Decorative Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className={cn(
          "absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-20 animate-pulse",
          darkMode ? "bg-purple-600" : "bg-purple-400"
        )} />
        <div className={cn(
          "absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-20 animate-pulse",
          darkMode ? "bg-cyan-600" : "bg-cyan-400"
        )} style={{ animationDelay: '2s' }} />
      </div>

      <AnimatePresence>
        {showLoginToast && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4"
          >
            <div className="bg-purple-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-lg">
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
        darkMode ? "bg-black/60 backdrop-blur-xl border-b border-white/5" : "bg-white/40 backdrop-blur-xl border-b border-black/5"
      )}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/20">
              <Wallet className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className={cn("text-xl font-extrabold font-display leading-tight tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                Finanzas Mil <span className="text-purple-600 italic">pro</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">Tu Asesor Personal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {recurringPayments.some(p => !p.isPaid) && (
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={cn(
                  "relative p-2.5 rounded-2xl transition-all active:scale-95",
                  darkMode ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600"
                )}
              >
                <Bell className="w-5 h-5" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-600 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-black">
                  {recurringPayments.filter(p => !p.isPaid).length}
                </span>
              </button>
            )}
            {userProfile && (
              <button 
                onClick={togglePlan}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  userProfile.plan === 'premium' 
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                    : darkMode ? "bg-zinc-900 text-slate-400" : "bg-slate-100 text-slate-600"
                )}
              >
                {userProfile.plan === 'premium' ? <Crown className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                {userProfile.plan === 'premium' ? 'Premium' : 'Básico'}
              </button>
            )}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              title="Ajustes"
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-95",
                darkMode ? "bg-black text-purple-400 hover:bg-zinc-900" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 pt-6 space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <DashboardView 
              movements={movements} 
              accounts={accounts} 
              categories={categories} 
              goals={goals}
              recurringPayments={recurringPayments}
              quickActions={quickActions}
              userProfile={userProfile}
              darkMode={darkMode} 
              stats={stats} 
              setActiveTab={setActiveTab} 
              onNavigateToCalendar={(date, viewDate) => {
                setCalendarTargetDate(date || new Date());
                setCalendarViewingDate(viewDate || date || new Date());
                setActiveTab('calendar');
              }}
              onAddMovement={(type) => {
                setMovementModalType(type || 'expense');
                setIsMovementModalOpen(true);
              }} 
              onDeleteMovement={handleDeleteMovement}
              deferredPrompt={deferredPrompt}
            />
          )}
          {activeTab === 'calendar' && (
            <CalendarView 
              movements={movements} 
              accounts={accounts} 
              categories={categories} 
              darkMode={darkMode} 
              onDelete={handleDeleteMovement}
              selectedDate={calendarTargetDate}
              setSelectedDate={setCalendarTargetDate}
              viewingDate={calendarViewingDate}
              setViewingDate={setCalendarViewingDate}
            />
          )}
          {activeTab === 'stats' && <StatsView movements={movements} categories={categories} darkMode={darkMode} />}
          {activeTab === 'budget' && <WeeklyBudgetView budget={weeklyBudget} userId={user.uid} darkMode={darkMode} categories={categories} />}
          {activeTab === 'advisor' && <FinanceAdvisorView movements={movements} accounts={accounts} goals={goals} categories={categories} darkMode={darkMode} plan={userProfile?.plan || 'basic'} userProfile={userProfile} />}
          {activeTab === 'accounts' && <AccountsView accounts={accounts} userId={user.uid} darkMode={darkMode} />}
          {activeTab === 'goals' && <GoalsView goals={goals} userId={user.uid} darkMode={darkMode} />}
        </AnimatePresence>
      </main>

      {/* Floating Action Button */}
      {activeTab !== 'advisor' && (
        <motion.button 
          key={buttonAnimateKey}
          onClick={() => setIsMovementModalOpen(true)}
          animate={buttonAnimateKey > 0 ? {
            scale: [1, 1.2, 1],
            rotate: [0, 15, -15, 0]
          } : {}}
          transition={{ duration: 0.5 }}
          className={cn(
            "fixed bottom-24 right-5 w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white z-40",
            darkMode ? "shadow-lg shadow-purple-500/20" : "shadow-lg shadow-purple-200"
          )}
        >
          <Plus className="w-7 h-7" />
        </motion.button>
      )}

      {/* Bottom Navigation */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 border-t px-2 py-2 z-50 transition-colors duration-300",
        darkMode ? "bg-black/80 backdrop-blur-2xl border-white/5" : "bg-white/60 backdrop-blur-2xl border-black/5"
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

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        userProfile={userProfile} 
        setUserProfile={setUserProfile}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onReset={handleResetApp}
        onLogout={handleManualLogout}
        deferredPrompt={deferredPrompt}
      />

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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={cn(
          "w-full max-w-sm p-6 rounded-3xl border shadow-2xl relative overflow-hidden",
          darkMode ? "bg-black border-zinc-800" : "bg-white border-slate-100"
        )}
      >
        <div className="relative z-10 text-center space-y-5">
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-1">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          
          <div className="space-y-1.5">
            <h3 className={cn("text-xl font-black font-display uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
              ¿Reiniciar App?
            </h3>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              Esta acción es <span className="text-rose-500 font-black">IRREVERSIBLE</span>. Se borrarán todos tus movimientos, cuentas, metas y presupuestos.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <button
              onClick={() => {
                setIsDeleting(true);
                onConfirm();
              }}
              disabled={isDeleting}
              className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-rose-500/25 active:scale-95 disabled:opacity-50"
            >
              {isDeleting ? "Borrando todo..." : "SÍ, BORRAR TODO"}
            </button>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className={cn(
                "w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                darkMode ? "bg-zinc-900 text-slate-400 hover:bg-zinc-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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
        "flex flex-col items-center gap-1 transition-all duration-300 relative py-0.5",
        active 
          ? "text-purple-500 scale-105" 
          : darkMode ? "text-slate-500 hover:text-slate-400" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <Icon className={cn("w-5 h-5 transition-all", active ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
      <span className="text-[9px] font-bold uppercase tracking-tight">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute -bottom-2 w-1 h-1 bg-purple-500 rounded-full"
        />
      )}
    </button>
  );
}

function MovementItem({ movement, categories, accounts, darkMode, onDelete }: { movement: Movement, categories: Category[], accounts: Account[], darkMode: boolean, onDelete?: (m: Movement) => void, key?: string | number }) {
  const category = categories.find(c => c.id === movement.categoryId);
  const account = accounts.find(a => a.id === movement.accountOriginId);
  
  const isIncome = movement.type === 'income';
  const isTransfer = movement.type === 'transfer';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "p-3 rounded-2xl border flex items-center justify-between transition-all duration-300 group relative overflow-hidden",
        darkMode 
          ? "glass-card border-zinc-800/50 hover:bg-zinc-900/80 hover:border-purple-500/30" 
          : "glass-card-light border-slate-100 hover:border-purple-100 shadow-sm hover:shadow-md"
      )}
    >
      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 shadow-sm group-hover:rotate-12",
          isIncome ? (darkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600") : 
          isTransfer ? (darkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600") : 
          (darkMode ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600")
        )}>
          {isIncome ? <TrendingUp className="w-5 h-5" /> : 
           isTransfer ? <ArrowRightLeft className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        </div>
        <div className="space-y-0.5">
          <p className={cn("font-display font-black text-lg uppercase tracking-tight transition-colors", darkMode ? "text-slate-200" : "text-slate-900")}>
            {category?.name || (isTransfer ? 'Transferencia' : 'Sin categoría')}
          </p>
          {movement.note && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg w-fit mb-1",
              darkMode ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-600 border border-purple-100"
            )}>
              <MessageSquare className="w-2.5 h-2.5" />
              <p className="text-[9px] font-bold italic truncate max-w-[120px]">
                {movement.note}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              {movement.accountOriginId ? (account?.name || 'Cuenta') : 'Sin cuenta'}
            </p>
            <span className="w-1 h-1 rounded-full bg-slate-700/30"></span>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              {format(parseISO(movement.date), 'dd MMM', { locale: es })}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className={cn(
            "font-display font-black text-2xl transition-colors tracking-tighter",
            isIncome ? "text-emerald-500" : isTransfer ? "text-blue-500" : (darkMode ? "text-slate-100" : "text-slate-900")
          )}>
            {isIncome ? '+' : isTransfer ? '' : '-'}S/ {movement.amount.toLocaleString()}
          </p>
          <p className={cn("text-[9px] font-black uppercase tracking-widest", darkMode ? "text-slate-700" : "text-slate-300")}>Confirmado</p>
        </div>
        
        {onDelete && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(movement);
            }}
            className={cn(
              "p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300",
              darkMode ? "hover:bg-rose-500/20 text-slate-600 hover:text-rose-400" : "hover:bg-rose-50 text-slate-300 hover:text-rose-500"
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center transition-colors duration-700 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]"></div>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-20 h-20 bg-purple-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/30 relative z-10"
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
          Finanzas Mil <span className="text-purple-600">pro</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto font-medium leading-relaxed">
          Gestiona tu libertad financiera con elegancia y precisión.
        </p>

        <div className="bg-white dark:bg-black/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xl mb-6">
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
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border-none rounded-xl text-sm focus:ring-2 focus:ring-purple-500 transition-all dark:text-white"
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
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border-none rounded-xl text-sm focus:ring-2 focus:ring-purple-500 transition-all dark:text-white"
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
              className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
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
              className="text-[11px] font-bold text-purple-600 hover:underline"
            >
              {isRegistering ? 'Inicia Sesión' : 'Regístrate'}
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
              <span className="bg-white dark:bg-black px-2 text-slate-400">O continuar con</span>
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

function SettingsModal({ 
  isOpen, 
  onClose, 
  userProfile, 
  setUserProfile,
  darkMode,
  setDarkMode,
  onReset,
  onLogout,
  deferredPrompt
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userProfile: UserProfile | null, 
  setUserProfile: (profile: UserProfile | null) => void,
  darkMode: boolean,
  setDarkMode: (val: boolean) => void,
  onReset: () => void,
  onLogout: () => void,
  deferredPrompt: any
}) {
  const [name, setName] = useState(userProfile?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [geminiKey, setGeminiKey] = useState(userProfile?.geminiApiKey || '');
  const [openaiKey, setOpenaiKey] = useState(userProfile?.openaiApiKey || '');
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [openaiStatus, setOpenaiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isValidatingGemini, setIsValidatingGemini] = useState(false);
  const [isValidatingOpenAI, setIsValidatingOpenAI] = useState(false);

  if (!isOpen) return null;

  const handleSaveGemini = async () => {
    if (!userProfile || !geminiKey.trim()) return;
    setIsValidatingGemini(true);
    setGeminiStatus('idle');
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "test",
      });
      
      const userRef = doc(db, 'users', userProfile.id);
      await updateDoc(userRef, { geminiApiKey: geminiKey });
      setUserProfile({ ...userProfile, geminiApiKey: geminiKey });
      setGeminiStatus('success');
    } catch (error) {
      console.error("Gemini validation error:", error);
      setGeminiStatus('error');
    } finally {
      setIsValidatingGemini(false);
    }
  };

  const handleSaveOpenAI = async () => {
    if (!userProfile || !openaiKey.trim()) return;
    setIsValidatingOpenAI(true);
    setOpenaiStatus('idle');
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiKey}` }
      });
      if (!response.ok) throw new Error('Invalid key');
      
      const userRef = doc(db, 'users', userProfile.id);
      await updateDoc(userRef, { openaiApiKey: openaiKey });
      setUserProfile({ ...userProfile, openaiApiKey: openaiKey });
      setOpenaiStatus('success');
    } catch (error) {
      console.error("OpenAI validation error:", error);
      setOpenaiStatus('error');
    } finally {
      setIsValidatingOpenAI(false);
    }
  };

  const handleSave = async () => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', userProfile.id);
      const updatedProfile = { ...userProfile, name };
      await updateDoc(userRef, { name });
      setUserProfile(updatedProfile);
      onClose();
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePlan = async () => {
    if (!userProfile) return;
    const newPlan = userProfile.plan === 'premium' ? 'basic' : 'premium';
    try {
      const userRef = doc(db, 'users', userProfile.id);
      await updateDoc(userRef, { plan: newPlan });
      setUserProfile({ ...userProfile, plan: newPlan });
    } catch (error) {
      console.error("Error updating plan:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={cn(
          "relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden",
          darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
        )}
      >
        {/* Decorative background blobs for modal */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between">
            <h2 className={cn("text-xl font-bold font-display", darkMode ? "text-white" : "text-slate-900")}>
              Ajustes
            </h2>
            <button 
              onClick={onClose}
              className={cn(
                "p-2 rounded-xl transition-all",
                darkMode ? "hover:bg-zinc-900 text-slate-400" : "hover:bg-slate-100 text-slate-500"
              )}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Profile Section */}
            <div className="space-y-2">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Perfil
              </label>
              <div className={cn(
                "p-4 rounded-2xl space-y-3",
                darkMode ? "bg-zinc-900/50" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {userProfile?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1">
                    <input 
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      className={cn(
                        "w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0",
                        darkMode ? "text-white placeholder:text-slate-600" : "text-slate-900 placeholder:text-slate-400"
                      )}
                    />
                    <p className="text-[10px] text-slate-500">{userProfile?.email}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Section */}
            <div className="space-y-2">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Suscripción
              </label>
              <button 
                onClick={togglePlan}
                className={cn(
                  "w-full p-4 rounded-2xl flex items-center justify-between transition-all active:scale-[0.98]",
                  darkMode ? "bg-zinc-900/50 hover:bg-zinc-900" : "bg-slate-50 hover:bg-slate-100"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    userProfile?.plan === 'premium' ? "bg-amber-500/10 text-amber-500" : "bg-purple-500/10 text-purple-500"
                  )}>
                    {userProfile?.plan === 'premium' ? <Crown className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                  </div>
                  <div className="text-left">
                    <p className={cn("text-sm font-bold", darkMode ? "text-white" : "text-slate-900")}>
                      Plan {userProfile?.plan === 'premium' ? 'Premium' : 'Básico'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {userProfile?.plan === 'premium' ? 'Acceso a todas las funciones' : 'Funciones limitadas'}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider",
                  userProfile?.plan === 'premium' ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {userProfile?.plan === 'premium' ? 'Activo' : 'Mejorar'}
                </div>
              </button>
            </div>

            {/* Appearance Section */}
            <div className="space-y-2">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Apariencia
              </label>
              <div className={cn(
                "p-4 rounded-2xl flex items-center justify-between",
                darkMode ? "bg-zinc-900/50" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    darkMode ? "bg-amber-500/10 text-amber-500" : "bg-purple-500/10 text-purple-500"
                  )}>
                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className={cn("text-sm font-bold", darkMode ? "text-white" : "text-slate-900")}>
                      Modo {darkMode ? 'Claro' : 'Oscuro'}
                    </p>
                    <p className="text-[10px] text-slate-500">Cambiar tema visual</p>
                  </div>
                </div>
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-all",
                    darkMode ? "bg-purple-600" : "bg-slate-300"
                  )}
                >
                  <motion.div 
                    animate={{ x: darkMode ? 24 : 4 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
            </div>

            {/* AI Keys Section */}
            <div className="space-y-3">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Inteligencia Artificial
              </label>
              
              {/* Gemini Key */}
              <div className={cn(
                "p-4 rounded-2xl space-y-3",
                darkMode ? "bg-zinc-900/50" : "bg-slate-50"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span className={cn("text-xs font-bold", darkMode ? "text-white" : "text-slate-900")}>Gemini API Key</span>
                  </div>
                  {geminiStatus !== 'idle' && (
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest",
                      geminiStatus === 'success' ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {geminiStatus === 'success' ? 'Instalado correctamente' : 'Esta mal la clave'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className={cn(
                      "flex-1 bg-transparent border-none p-0 text-xs font-mono focus:ring-0",
                      darkMode ? "text-white placeholder:text-slate-700" : "text-slate-900 placeholder:text-slate-300"
                    )}
                  />
                  <button 
                    onClick={handleSaveGemini}
                    disabled={isValidatingGemini}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                      darkMode ? "bg-zinc-800 text-purple-400 hover:bg-zinc-700" : "bg-white text-purple-600 border border-slate-100 shadow-sm"
                    )}
                  >
                    {isValidatingGemini ? 'Validando...' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* OpenAI Key */}
              <div className={cn(
                "p-4 rounded-2xl space-y-3",
                darkMode ? "bg-zinc-900/50" : "bg-slate-50"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    <span className={cn("text-xs font-bold", darkMode ? "text-white" : "text-slate-900")}>ChatGPT API Key</span>
                  </div>
                  {openaiStatus !== 'idle' && (
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest",
                      openaiStatus === 'success' ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {openaiStatus === 'success' ? 'Instalado correctamente' : 'Esta mal la clave'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className={cn(
                      "flex-1 bg-transparent border-none p-0 text-xs font-mono focus:ring-0",
                      darkMode ? "text-white placeholder:text-slate-700" : "text-slate-900 placeholder:text-slate-300"
                    )}
                  />
                  <button 
                    onClick={handleSaveOpenAI}
                    disabled={isValidatingOpenAI}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                      darkMode ? "bg-zinc-800 text-emerald-400 hover:bg-zinc-700" : "bg-white text-emerald-600 border border-slate-100 shadow-sm"
                    )}
                  >
                    {isValidatingOpenAI ? 'Validando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Install App Section */}
            <div className="space-y-2">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Aplicación
              </label>
              <div className={cn(
                "p-4 rounded-2xl flex items-center justify-between",
                darkMode ? "bg-zinc-900/50" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    darkMode ? "bg-purple-500/10 text-purple-400" : "bg-purple-50 text-purple-600"
                  )}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-bold", darkMode ? "text-white" : "text-slate-900")}>
                      Instalar App
                    </p>
                    <p className="text-[10px] text-slate-500">Acceso rápido desde tu inicio</p>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    if (deferredPrompt) {
                      deferredPrompt.prompt();
                      const { outcome } = await deferredPrompt.userChoice;
                      if (outcome === 'accepted') {
                        console.log('User accepted the install prompt');
                      }
                    } else {
                      alert('Para instalar: \n1. Toca el botón de compartir \n2. Selecciona "Añadir a pantalla de inicio"');
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                    darkMode ? "bg-purple-600 text-white" : "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
                  )}
                >
                  Instalar
                </button>
              </div>
            </div>

            {/* Actions Section */}
            <div className="space-y-2">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-slate-400")}>
                Sistema
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    onClose();
                    onReset();
                  }}
                  className={cn(
                    "p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95",
                    darkMode ? "bg-zinc-900/50 hover:bg-zinc-900 text-amber-400" : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                  )}
                >
                  <RefreshCcw className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Reiniciar</span>
                </button>
                <button 
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className={cn(
                    "p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95",
                    darkMode ? "bg-zinc-900/50 hover:bg-zinc-900 text-rose-400" : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                  )}
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Salir</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              onClick={onClose}
              className={cn(
                "flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95",
                darkMode ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
              )}
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                "flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2",
                "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20 disabled:opacity-50"
              )}
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar
            </button>
          </div>
        </div>
      </motion.div>
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
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className={cn(
          "w-full max-w-md rounded-t-2xl sm:rounded-2xl p-3.5 space-y-3 transition-colors duration-300 relative overflow-hidden",
          darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
        )}
      >
        {/* Decorative background blobs for modal */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest">Nuevo Movimiento</h2>
          <button onClick={onClose} className={cn(
            "p-1.5 rounded-full transition-colors",
            darkMode ? "bg-zinc-900 hover:bg-zinc-800" : "bg-slate-100 hover:bg-slate-200"
          )}><X className="w-4 h-4" /></button>
        </div>

        <div className={cn("flex p-1 rounded-xl transition-colors", darkMode ? "bg-zinc-900" : "bg-slate-100")}>
          <button 
            onClick={() => setType('expense')}
            className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", type === 'expense' ? (darkMode ? "bg-zinc-800 text-rose-400 shadow-lg" : "bg-white shadow-md text-rose-600") : "text-slate-500")}
          >Gasto</button>
          <button 
            onClick={() => setType('income')}
            className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", type === 'income' ? (darkMode ? "bg-zinc-800 text-emerald-400 shadow-lg" : "bg-white shadow-md text-emerald-600") : "text-slate-500")}
          >Ingreso</button>
          <button 
            onClick={() => setType('transfer')}
            className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", type === 'transfer' ? (darkMode ? "bg-zinc-800 text-blue-400 shadow-lg" : "bg-white shadow-md text-blue-600") : "text-slate-500")}
          >Transf.</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Monto</label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-purple-500 transition-transform group-focus-within:scale-110">S/</span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={cn(
                  "w-full border-none rounded-[1.5rem] py-4 pl-12 pr-6 text-3xl font-black font-display focus:ring-4 focus:ring-purple-500/20 transition-all",
                  darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
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
                  "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 transition-colors",
                  darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
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
                    "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 transition-colors",
                    darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
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
                    "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 transition-colors",
                    darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                  )}
                  required={type !== 'transfer'}
                >
                  <option value="">Seleccionar</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="NEW">+ Nueva Categoría</option>
                </select>
                {categoryId === 'NEW' && (
                  <input 
                    type="text"
                    placeholder="Nombre de categoría + Enter"
                    autoFocus
                    className={cn(
                      "w-full mt-2 border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-800 text-white" : "bg-slate-100 text-slate-900"
                    )}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = (e.target as HTMLInputElement).value.trim();
                        if (name && userId) {
                          try {
                            const docRef = await addDoc(collection(db, 'categories'), { name, userId });
                            setCategoryId(docRef.id);
                          } catch (err) {
                            console.error(err);
                          }
                        }
                      }
                    }}
                  />
                )}
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
                "w-full border-none rounded-xl py-2 px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 transition-colors",
                darkMode ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
              )}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" />
              Nota (Opcional)
            </label>
            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="¿En qué gastaste? (Ej: Almuerzo con amigos, Pasaje a Lima...)"
              rows={2}
              className={cn(
                "w-full border-none rounded-2xl py-4 px-5 text-sm font-medium focus:ring-4 focus:ring-purple-500/20 transition-all resize-none",
                darkMode ? "bg-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 text-slate-900 placeholder:text-slate-400"
              )}
            />
          </div>

          <button 
            disabled={isSubmitting}
            className={cn(
              "w-full py-4 rounded-2xl font-extrabold text-base shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3",
              type === 'expense' ? "bg-rose-600 text-white shadow-rose-500/20 hover:bg-rose-700" :
              type === 'income' ? "bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-700" :
              "bg-purple-600 text-white shadow-purple-500/20 hover:bg-purple-700"
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-14 pb-32"
    >
      {/* Header Section */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className={cn(
            "text-2xl font-black font-display tracking-tight transition-colors",
            darkMode ? "text-white" : "text-slate-900"
          )}>
            Presupuesto
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
            Planificación Semanal
          </p>
        </div>
        <motion.div 
          whileTap={{ scale: 0.9 }}
          className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20"
        >
          <ClipboardList className="w-6 h-6 text-purple-600" />
        </motion.div>
      </div>

      {/* Income Card - Pro Style */}
      <div className={cn(
        "p-8 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden group",
        darkMode 
          ? "glass-card border-slate-800/50 shadow-2xl shadow-emerald-500/5" 
          : "glass-card-light border-slate-100 shadow-xl shadow-slate-200/50"
      )}>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] group-hover:bg-emerald-500/10 transition-colors duration-700"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/5 rounded-full blur-[60px]"></div>
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              Ingreso Semanal
            </label>
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black font-display text-emerald-500 tracking-tighter">S/</span>
            <input 
              type="number" 
              value={income || ''} 
              onChange={(e) => handleIncomeChange(e.target.value)}
              placeholder="0.00"
              className={cn(
                "text-5xl font-black font-display bg-transparent border-none focus:ring-0 w-full p-0 tracking-tighter placeholder:text-slate-300",
                darkMode ? "text-white" : "text-slate-900"
              )}
            />
          </div>
          
          <div className="pt-2 flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span>Presupuesto base para la semana</span>
          </div>
        </div>
      </div>

      {/* Summary Row - Pro Style */}
      <div className="grid grid-cols-2 gap-4 px-1">
        <motion.div 
          whileTap={{ scale: 0.98 }}
          className={cn(
            "p-5 rounded-[1.5rem] border transition-all duration-300 relative overflow-hidden",
            darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-lg shadow-slate-200/30"
          )}
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-2xl"></div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Gastos Totales</p>
          <p className="text-xl font-black font-display text-rose-500 tracking-tighter">
            S/ {totalExpenses.toLocaleString()}
          </p>
        </motion.div>

        <motion.div 
          whileTap={{ scale: 0.98 }}
          className={cn(
            "p-5 rounded-[1.5rem] border transition-all duration-300 relative overflow-hidden",
            darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-lg shadow-slate-200/30"
          )}
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-2xl"></div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo Libre</p>
          <p className={cn(
            "text-xl font-black font-display tracking-tighter",
            remaining >= 0 ? "text-emerald-500" : "text-rose-500"
          )}>
            S/ {remaining.toLocaleString()}
          </p>
        </motion.div>
      </div>

      {/* Category Distribution - Pro Style */}
      {categorySummary.length > 0 && (
        <div className={cn(
          "p-6 rounded-[2rem] border transition-all duration-300 space-y-6",
          darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-xl shadow-slate-200/40"
        )}>
          <div className="flex items-center justify-between">
            <h3 className={cn("font-black font-display text-lg tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
              Distribución
            </h3>
            <PieChart className="w-5 h-5 text-purple-500 opacity-50" />
          </div>
          
          <div className="space-y-5">
            {categorySummary.map(([cat, amount]) => {
              const percentage = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs font-bold", darkMode ? "text-slate-400" : "text-slate-500")}>
                      {cat}
                    </span>
                    <span className={cn("text-sm font-black font-display", darkMode ? "text-white" : "text-slate-900")}>
                      S/ {amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className="h-full bg-purple-500 rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Expense Section - Pro Style */}
      <div className={cn(
        "p-4 rounded-2xl border transition-all duration-300 space-y-4",
        darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-xl shadow-slate-200/40"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={cn("font-black font-display text-sm tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
              Nuevo Gasto
            </h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Planifica tu consumo</p>
          </div>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsManagingCategories(!isManagingCategories)}
            className={cn(
              "w-10 h-10 rounded-xl transition-all flex items-center justify-center",
              darkMode ? "bg-zinc-900 text-slate-400" : "bg-slate-50 text-slate-500"
            )}
          >
            <Settings className={cn("w-5 h-5 transition-transform duration-500", isManagingCategories && "rotate-90")} />
          </motion.button>
        </div>

        {isManagingCategories ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Nueva categoría..." 
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className={cn(
                  "flex-1 py-4 px-5 rounded-2xl border font-bold text-sm transition-all focus:ring-4 focus:ring-purple-500/10",
                  darkMode ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              />
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={handleAddCategory}
                className="w-14 h-14 bg-purple-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20"
              >
                <Plus className="w-6 h-6" />
              </motion.button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <motion.div 
                  layout
                  key={cat.id}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider",
                    darkMode ? "bg-zinc-900 border-zinc-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"
                  )}
                >
                  <span>{cat.name}</span>
                  <button onClick={() => handleRemoveCategory(cat.id)} className="text-rose-500">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={cat.id}
                onClick={() => handleAddExpense(cat.name)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  darkMode 
                    ? "bg-zinc-900 border-zinc-800 text-slate-300 hover:bg-purple-500/10 hover:border-purple-500/30" 
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-purple-200 hover:shadow-md"
                )}
              >
                {cat.name}
              </motion.button>
            ))}
          </div>
        )}

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8">
              <input 
                type="text" 
                placeholder="Concepto..." 
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
                className={cn(
                  "w-full py-4 px-6 rounded-2xl border font-bold text-sm transition-all focus:ring-4 focus:ring-purple-500/10",
                  darkMode ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              />
            </div>
            <div className="col-span-4">
              <input 
                type="number" 
                placeholder="0.00" 
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className={cn(
                  "w-full py-4 px-4 rounded-2xl border font-black text-sm text-center transition-all focus:ring-4 focus:ring-purple-500/10",
                  darkMode ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              />
            </div>
          </div>
          
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={() => handleAddExpense()}
            className={cn(
              "w-full py-5 rounded-[2rem] font-black text-xs shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-4 group",
              darkMode 
                ? "bg-purple-600 text-white shadow-purple-500/20 hover:bg-purple-500" 
                : "bg-purple-600 text-white shadow-purple-200 hover:bg-purple-700"
            )}
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform duration-500">
              <Plus className="w-5 h-5" />
            </div>
            <span className="uppercase tracking-[0.2em]">Agregar Gasto</span>
          </motion.button>
        </div>
      </div>

      {/* Expenses List - Pro Style */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className={cn(
            "font-black font-display text-xl tracking-tight transition-colors",
            darkMode ? "text-white" : "text-slate-900"
          )}>
            Gastos Planificados
          </h3>
          <span className="text-[10px] font-black text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full uppercase tracking-widest">
            {expenses.length} Items
          </span>
        </div>

        <div className="space-y-4">
          {expenses.length === 0 ? (
            <div className={cn(
              "p-12 rounded-[2.5rem] border border-dashed flex flex-col items-center justify-center text-center space-y-4",
              darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"
            )}>
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center">
                <ClipboardList className="w-8 h-8 opacity-20" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest">No hay gastos planificados</p>
            </div>
          ) : (
            expenses.map((exp, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "p-6 rounded-[2rem] border flex items-center justify-between transition-all duration-300 group relative overflow-hidden",
                  darkMode 
                    ? "glass-card border-slate-800/50 hover:border-purple-500/30" 
                    : "glass-card-light border-slate-100 shadow-md hover:shadow-xl hover:border-purple-100"
                )}
              >
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                    darkMode ? "bg-slate-800 text-purple-400" : "bg-purple-50 text-purple-600"
                  )}>
                    <TrendingDown className="w-6 h-6" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-black transition-colors", darkMode ? "text-white" : "text-slate-900")}>
                      {exp.name || "Sin nombre"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-black text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-md uppercase tracking-widest">
                        {exp.category}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className={cn("text-lg font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                    S/ {exp.amount.toLocaleString()}
                  </p>
                  <motion.button 
                    whileTap={{ scale: 0.8 }}
                    onClick={() => handleRemoveExpense(i)}
                    className="p-3 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-5 h-5" />
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FinanceAdvisorView({ movements, accounts, goals, categories, darkMode, plan, userProfile }: { movements: Movement[], accounts: Account[], goals: Goal[], categories: Category[], darkMode: boolean, plan: 'basic' | 'premium', userProfile: UserProfile | null }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const statsSummary = useMemo(() => {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.currentAmount >= g.targetAmount).length;
    
    // Summary by category
    const spendingByCategory: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};
    
    movements.forEach(m => {
      const cat = categories.find(c => c.id === m.categoryId)?.name || 'Sin categoría';
      if (m.type === 'expense') {
        spendingByCategory[cat] = (spendingByCategory[cat] || 0) + m.amount;
      } else {
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + m.amount;
      }
    });

    const recentMovements = movements.slice(0, 20).map(m => {
      const cat = categories.find(c => c.id === m.categoryId)?.name || 'Sin categoría';
      return `${m.type === 'income' ? '+' : '-'}S/ ${m.amount} [${cat}] (${format(parseISO(m.date), 'dd/MM/yy')})${m.note ? ` nota: ${m.note}` : ''}`;
    }).join('; ');
    
    const spendingStr = Object.entries(spendingByCategory).map(([cat, amt]) => `${cat}: S/ ${amt}`).join(', ');
    const incomeStr = Object.entries(incomeByCategory).map(([cat, amt]) => `${cat}: S/ ${amt}`).join(', ');

    return `
      FECHA ACTUAL: ${format(new Date(), 'yyyy-MM-dd HH:mm')}
      SALDO TOTAL: S/ ${totalBalance}
      METAS: ${completedGoals}/${totalGoals} completadas.
      
      RESUMEN POR CATEGORÍAS (HISTÓRICO):
      GASTOS: ${spendingStr || 'Sin gastos registrados'}
      INGRESOS: ${incomeStr || 'Sin ingresos registrados'}
      
      ÚLTIMOS 20 MOVIMIENTOS:
      ${recentMovements}
      
      TOTAL MOVIMIENTOS REGISTRADOS: ${movements.length}
    `;
  }, [movements, accounts, goals, categories]);

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim() || isTyping) return;
    if (plan === 'basic' && messages.length >= 6) { // More messages allowed in basic for context testing
      alert("El plan básico tiene un límite. ¡Pásate a Premium para chats ilimitados!");
      return;
    }

    const userMsg = { role: 'user' as const, text: textToSend };
    const newHistory = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const apiKey = userProfile?.geminiApiKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        setMessages(prev => [...prev, { 
          role: 'model', 
          text: "Configura tu Gemini API Key en Ajustes para usar el asesor IA." 
        }]);
        setIsTyping(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const systemInstruction = `Eres LIA (Logros e Inteligencia Ahorrativa), una asesora financiera experta, profesional, natural y cercana. 
      Tu objetivo es ayudar al usuario a gestionar su dinero basándote ÚNICAMENTE en sus datos REALES proporcionados a continuación.
      
      CONTEXTO FINANCIERO DEL USUARIO (Datos actuales):
      ${statsSummary}
      
      REGLAS CRÍTICAS DE RESPUESTA:
      1. BÚSQUEDA DE BREVEDAD: Responde de forma muy concisa. Si es un saludo (hola, qué tal, etc), responde en UNA O DOS líneas de forma natural y cercana, invitando al usuario a preguntar.
      2. NO REPITAS DATOS: Nunca des un resumen de todas las cuentas o gastos a menos que te lo pidan explícitamente.
      3. ESPECIFICIDAD: Solo cuando pregunten por gastos (ej: "cuánto gasté en comida"), usa los datos para dar la cifra exacta y un consejo breve.
      4. CONTINUIDAD HUMANA: Sigue el flujo de la charla como ChatGPT o Claude. Sé una experta humana, no un reporte automático.
      5. MÁXIMO 2-3 PÁRRAFOS: Incluso para consultas complejas, nunca excedas este límite.
      6. SIGUE LA CORRIENTE: Si el usuario bromea o charla de forma casual, responde con naturalidad antes de volver al tema financiero.`;

      const contents = [
        ...newHistory.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      ];

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: systemInstruction
        }
      });
      const modelMsg = { role: 'model' as const, text: result.text || "Lo siento, no pude procesar tu solicitud." };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error: any) {
      console.error("Error with Gemini:", error);
      let errorMessage = "Hubo un error al conectar con el asesor. Por favor intenta de nuevo.";
      
      if (error?.message?.includes('API_KEY_INVALID')) {
        errorMessage = "La API Key de Gemini es inválida. Por favor verifícala en Ajustes.";
      } else if (error?.message?.includes('quota')) {
        errorMessage = "Se ha agotado la cuota de la API de Gemini. Intenta más tarde.";
      }

      setMessages(prev => [...prev, { role: 'model', text: errorMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const quickQueries = [
    "¿Cúanto gasté la semana pasada?",
    "¿En qué categoría gasto más?",
    "¿Cómo voy con mis metas?",
    "¿Consejo para ahorrar hoy?"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Asesor IA (LIA)</h2>
        </div>
        {plan === 'basic' && (
          <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Plan Básico</span>
        )}
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto p-3 rounded-2xl border space-y-3 transition-colors",
        darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
      )}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 p-4">
            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-500" />
            </div>
            <div>
              <p className={cn("font-black text-lg uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Hola, soy LIA</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mb-4">Tu experta financiera personal</p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickQueries.map((q, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSend(q)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95",
                      darkMode ? "bg-zinc-900 border-zinc-800 text-slate-400 hover:text-purple-400" : "bg-white border-slate-100 text-slate-500 hover:text-purple-600 shadow-sm"
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={cn(
                "flex",
                msg.role === 'user' ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "max-w-[85%] p-4 rounded-3xl text-[13px] font-bold leading-relaxed shadow-sm",
                  msg.role === 'user' 
                    ? "bg-purple-600 text-white rounded-tr-none" 
                    : darkMode ? "bg-zinc-900 text-slate-200 rounded-tl-none border border-zinc-800" : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {/* Quick replies for flow */}
            {messages[messages.length-1].role === 'model' && (
              <div className="flex gap-2 p-1 overflow-x-auto no-scrollbar">
                {["Gracias LIA", "¿Y mis metas?", "¿Cómo ahorro más?"].map((q, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSend(q)}
                    className={cn(
                      "whitespace-nowrap px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all",
                      darkMode ? "bg-zinc-900/50 border-zinc-800 text-slate-500" : "bg-slate-50 border-slate-200 text-slate-400"
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className={cn(
              "p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2",
              darkMode ? "bg-zinc-900 text-slate-500" : "bg-slate-50 text-slate-400"
            )}>
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
              LIA está analizando...
            </div>
          </div>
        )}
      </div>

      <div className="p-1 space-y-2">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Habla con LIA..."
            className={cn(
              "flex-1 py-4 px-6 rounded-2xl border-none focus:ring-2 focus:ring-purple-500 transition-colors text-sm font-bold",
              darkMode ? "glass-card text-white placeholder:text-zinc-600" : "glass-card-light text-slate-900 shadow-sm placeholder:text-slate-400"
            )}
          />
          <button 
            onClick={() => handleSend()}
            disabled={isTyping}
            className="w-14 h-14 flex items-center justify-center bg-purple-600 text-white rounded-2xl shadow-xl shadow-purple-500/30 active:scale-95 transition-all disabled:opacity-50"
          >
            <ArrowRightLeft className="w-6 h-6 rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RecurringPaymentModal({ 
  isOpen, 
  onClose, 
  categories, 
  userId, 
  darkMode,
  recurringPayments 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  categories: Category[], 
  userId: string, 
  darkMode: boolean,
  recurringPayments: RecurringPayment[]
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>('monthly');

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!name || !amount || !categoryId) return;
    
    const newPayment: Omit<RecurringPayment, 'id'> = {
      name,
      amount: parseFloat(amount),
      dueDate: new Date(dueDate).toISOString(),
      frequency,
      categoryId,
      userId,
      isPaid: false
    };

    try {
      await addDoc(collection(db, 'recurringPayments'), newPayment);
      setName('');
      setAmount('');
      onClose();
    } catch (error) {
      console.error("Error adding recurring payment:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'recurringPayments', id));
    } catch (error) {
      console.error("Error deleting recurring payment:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={cn(
          "relative w-full max-w-md p-8 rounded-[3rem] border shadow-2xl overflow-hidden",
          darkMode ? "bg-black border-zinc-800" : "bg-white border-slate-100"
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className={cn("text-2xl font-black uppercase tracking-widest", darkMode ? "text-white" : "text-slate-900")}>Pagos Recurrentes</h3>
          <button onClick={onClose} className={cn("p-2 rounded-full", darkMode ? "hover:bg-zinc-900 text-slate-400" : "hover:bg-slate-100 text-slate-400")}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* List existing */}
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {recurringPayments.map(p => (
              <div key={p.id} className={cn("p-3 rounded-2xl flex items-center justify-between", darkMode ? "bg-zinc-900/50" : "bg-slate-50")}>
                <div>
                  <p className={cn("text-xs font-bold", darkMode ? "text-white" : "text-slate-900")}>{p.name}</p>
                  <p className="text-[9px] text-slate-500 uppercase">S/ {p.amount} • {p.frequency}</p>
                </div>
                <button onClick={() => p.id && handleDelete(p.id)} className="text-rose-500 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="h-px bg-zinc-800/50" />

          {/* Add new */}
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Nombre (ej: Alquiler)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn("w-full p-4 rounded-2xl text-sm font-bold", darkMode ? "bg-zinc-900 text-white border-none" : "bg-slate-50 text-slate-900 border-none")}
            />
            <div className="grid grid-cols-2 gap-3">
              <input 
                type="number" 
                placeholder="Monto"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn("w-full p-4 rounded-2xl text-sm font-bold", darkMode ? "bg-zinc-900 text-white border-none" : "bg-slate-50 text-slate-900 border-none")}
              />
              <input 
                type="date" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={cn("w-full p-4 rounded-2xl text-sm font-bold", darkMode ? "bg-zinc-900 text-white border-none" : "bg-slate-50 text-slate-900 border-none")}
              />
            </div>
            <select 
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={cn("w-full p-4 rounded-2xl text-sm font-bold", darkMode ? "bg-zinc-900 text-white border-none" : "bg-slate-50 text-slate-900 border-none")}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button 
                onClick={() => setFrequency('monthly')}
                className={cn("flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all", 
                  frequency === 'monthly' ? "bg-purple-600 text-white" : (darkMode ? "bg-zinc-900 text-slate-500" : "bg-slate-100 text-slate-500"))}
              >
                Mensual
              </button>
              <button 
                onClick={() => setFrequency('weekly')}
                className={cn("flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all", 
                  frequency === 'weekly' ? "bg-purple-600 text-white" : (darkMode ? "bg-zinc-900 text-slate-500" : "bg-slate-100 text-slate-500"))}
              >
                Semanal
              </button>
            </div>
            <button 
              onClick={handleAdd}
              className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-purple-600/20 active:scale-95 transition-all"
            >
              Agregar Recordatorio
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function QuickActionModal({ 
  isOpen, 
  onClose, 
  darkMode, 
  userId,
  editingAction 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  darkMode: boolean, 
  userId: string,
  editingAction: QuickAction | null
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [icon, setIcon] = useState('DollarSign');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingAction) {
      setLabel(editingAction.label);
      setAmount(editingAction.amount.toString());
      setIcon(editingAction.icon);
    } else {
      setLabel('');
      setAmount('');
      setIcon('DollarSign');
    }
  }, [editingAction, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !amount || !userId) return;

    setIsSubmitting(true);
    try {
      const data = {
        label,
        amount: parseFloat(amount),
        icon,
        userId
      };

      if (editingAction) {
        await updateDoc(doc(db, 'quickActions', editingAction.id), data);
      } else {
        await addDoc(collection(db, 'quickActions'), data);
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingAction) return;
    if (!window.confirm('¿Eliminar este acceso rápido?')) return;
    
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'quickActions', editingAction.id));
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const icons = ['DollarSign', 'Utensils', 'Bus', 'Coffee', 'Smartphone', 'Sun', 'ShoppingBag', 'Zap', 'Heart', 'Music'];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden",
          darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-widest">
            {editingAction ? 'Editar Gasto Rápido' : 'Nuevo Gasto Rápido'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50 px-1">Nombre</label>
            <input 
              type="text" 
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Almuerzo"
              className={cn(
                "w-full p-4 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all",
                darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50 px-1">Monto (S/)</label>
            <input 
              type="number" 
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={cn(
                "w-full p-4 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all",
                darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50 px-1">Icono</label>
            <div className="grid grid-cols-5 gap-2">
              {icons.map(i => {
                const IconComp = (LucideIcons as any)[i] || DollarSign;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={cn(
                      "p-3 rounded-xl flex items-center justify-center transition-all",
                      icon === i 
                        ? "bg-purple-600 text-white" 
                        : darkMode ? "bg-zinc-900 text-slate-500" : "bg-slate-50 text-slate-400"
                    )}
                  >
                    <IconComp className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            {editingAction && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 py-4 rounded-2xl bg-rose-500/10 text-rose-500 text-xs font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
              >
                Eliminar
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-4 rounded-2xl bg-purple-600 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-purple-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function SummaryTableModal({ 
  isOpen, 
  onClose, 
  movements, 
  categories, 
  darkMode, 
  type 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  movements: Movement[], 
  categories: Category[], 
  darkMode: boolean, 
  type: MovementType 
}) {
  if (!isOpen) return null;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group days by week
  const weeks: Date[][] = [];
  monthDays.forEach(day => {
    const weekIndex = getWeekOfMonth(day) - 1;
    if (!weeks[weekIndex]) weeks[weekIndex] = [];
    weeks[weekIndex].push(day);
  });

  // Filter movements for current month and type
  const currentMovements = movements.filter(m => {
    const d = parseISO(m.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && m.type === type;
  });

  // Get unique categories in these movements
  const usedCategoryIds = Array.from(new Set(currentMovements.map(m => m.categoryId)));
  const usedCategories = usedCategoryIds.map(id => categories.find(c => c.id === id)).filter(Boolean) as Category[];

  const getAmountForDayAndCategory = (day: Date, categoryId: string) => {
    return currentMovements
      .filter(m => isSameDay(parseISO(m.date), day) && m.categoryId === categoryId)
      .reduce((sum, m) => sum + m.amount, 0);
  };

  const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={cn(
              "w-full max-w-5xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col",
              darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
            )}
          >
            <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <h2 className={cn("text-xl font-black font-display uppercase tracking-widest", darkMode ? "text-white" : "text-slate-900")}>
                {type === 'expense' ? 'Gastos' : 'Ingresos'} {format(now, 'MMMM', { locale: es }).toUpperCase()}
              </h2>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 scrollbar-thin">
              <div className="min-w-[800px] space-y-8">
                {weeks.map((weekDays, weekIdx) => {
                  const weekTotal = weekDays.reduce((sum, day) => {
                    return sum + currentMovements.filter(m => isSameDay(parseISO(m.date), day)).reduce((s, m) => s + m.amount, 0);
                  }, 0);

                  return (
                    <div key={weekIdx} className="space-y-0">
                      <table className="w-full border-collapse text-[10px] font-bold">
                        <thead>
                          <tr className={cn(
                            "text-white",
                            type === 'expense' 
                              ? (darkMode ? "bg-rose-600" : "bg-rose-700") 
                              : (darkMode ? "bg-emerald-600" : "bg-emerald-700")
                          )}>
                            <th className="border border-white/20 p-3 text-left w-32 uppercase tracking-tighter">DESCRIPCION</th>
                            {dayNames.map(name => (
                              <th key={name} className="border border-white/20 p-3 uppercase tracking-tighter">{name}</th>
                            ))}
                            <th className="border border-white/20 p-3 uppercase w-24 bg-black/30">TOTAL</th>
                          </tr>
                          <tr className={cn(
                            darkMode ? "bg-zinc-800 text-slate-300" : "bg-slate-200 text-slate-700"
                          )}>
                            <th className="border border-slate-300 dark:border-zinc-700 p-1.5"></th>
                            {dayNames.map((_, i) => {
                              const dayInWeek = weekDays.find(d => getDay(d) === i);
                              return (
                                <th key={i} className={cn(
                                  "border border-slate-300 dark:border-zinc-700 p-1.5 text-center font-black text-sm",
                                  dayInWeek && (darkMode ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-700")
                                )}>
                                  {dayInWeek ? format(dayInWeek, 'd') : ''}
                                </th>
                              );
                            })}
                            <th className="border border-slate-300 dark:border-zinc-700 p-1.5 bg-black/10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {usedCategories.map(cat => {
                            const rowTotal = weekDays.reduce((sum, day) => sum + getAmountForDayAndCategory(day, cat.id), 0);
                            if (rowTotal === 0) return null;

                            return (
                              <tr key={cat.id} className={darkMode ? "hover:bg-zinc-800/30" : "hover:bg-slate-50"}>
                                <td className={cn(
                                  "border border-slate-200 dark:border-zinc-800 p-2 font-black uppercase tracking-tighter",
                                  darkMode ? "bg-zinc-900/30 text-slate-300" : "bg-slate-50/50 text-slate-600"
                                )}>
                                  {cat.name}
                                </td>
                                {dayNames.map((_, i) => {
                                  const dayInWeek = weekDays.find(d => getDay(d) === i);
                                  const amount = dayInWeek ? getAmountForDayAndCategory(dayInWeek, cat.id) : 0;
                                  return (
                                    <td key={i} className="border border-slate-200 dark:border-zinc-800 p-2 text-center font-display text-xs">
                                      {amount > 0 ? `S/ ${amount.toLocaleString()}` : ''}
                                    </td>
                                  );
                                })}
                                <td className={cn(
                                  "border border-slate-200 dark:border-zinc-800 p-2 text-center font-black font-display text-xs",
                                  type === 'expense' ? "text-rose-500 bg-rose-500/5" : "text-emerald-500 bg-emerald-500/5"
                                )}>
                                  S/ {rowTotal.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className={cn(
                            "font-black",
                            darkMode ? "bg-zinc-900 text-slate-200" : "bg-slate-200 text-slate-700"
                          )}>
                            <td className="border border-slate-300 dark:border-zinc-700 p-2 uppercase tracking-widest text-purple-500">SUBTOTAL</td>
                            {dayNames.map((_, i) => {
                              const dayInWeek = weekDays.find(d => getDay(d) === i);
                              const dayTotal = dayInWeek ? currentMovements.filter(m => isSameDay(parseISO(m.date), dayInWeek)).reduce((s, m) => s + m.amount, 0) : 0;
                              return (
                                <td key={i} className="border border-slate-300 dark:border-zinc-700 p-2 text-center font-display text-xs">
                                  {dayTotal > 0 ? `S/ ${dayTotal.toLocaleString()}` : ''}
                                </td>
                              );
                            })}
                            <td className={cn(
                              "border border-slate-300 dark:border-zinc-700 p-2 text-center font-display text-sm",
                              type === 'expense' ? "text-rose-600 bg-rose-600/10" : "text-emerald-600 bg-emerald-600/10"
                            )}>
                              S/ {weekTotal.toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                
                <div className={cn(
                  "p-4 rounded-2xl flex items-center justify-between",
                  darkMode ? "bg-purple-900/20 border border-purple-500/20" : "bg-amber-500 border border-amber-600"
                )}>
                  <span className={cn("text-lg font-black uppercase tracking-widest", darkMode ? "text-purple-400" : "text-white")}>TOTAL GENERAL</span>
                  <span className={cn("text-2xl font-black font-display", darkMode ? "text-white" : "text-white")}>
                    S/ {currentMovements.reduce((s, m) => s + m.amount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DashboardView({ 
  movements, 
  accounts, 
  categories, 
  goals, 
  recurringPayments,
  quickActions,
  userProfile,
  darkMode, 
  stats, 
  setActiveTab, 
  onAddMovement, 
  onNavigateToCalendar,
  onDeleteMovement,
  deferredPrompt
}: { 
  movements: Movement[], 
  accounts: Account[], 
  categories: Category[], 
  goals: Goal[], 
  recurringPayments: RecurringPayment[],
  quickActions: QuickAction[],
  userProfile: UserProfile | null,
  darkMode: boolean, 
  stats: DashboardStats, 
  setActiveTab: (tab: string) => void, 
  onNavigateToCalendar: (date?: Date, viewDate?: Date) => void,
  onAddMovement: (type?: MovementType) => void, 
  onDeleteMovement?: (m: Movement) => void,
  deferredPrompt: any
}) {
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isQuickActionModalOpen, setIsQuickActionModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [editingQuickAction, setEditingQuickAction] = useState<QuickAction | null>(null);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [summaryModal, setSummaryModal] = useState<{ open: boolean, type: MovementType }>({ open: false, type: 'expense' });
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const personalDailyStats = useMemo(() => {
    const dMovements = movements.filter(m => isSameDay(parseISO(m.date), selectedDay));
    return {
      income: dMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0),
      expense: dMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0),
    };
  }, [selectedDay, movements]);

  const personalWeeklyStats = useMemo(() => {
    const start = startOfWeek(selectedWeek, { weekStartsOn: 0 });
    const end = endOfWeek(selectedWeek, { weekStartsOn: 0 });
    const wMovements = movements.filter(m => {
      const d = parseISO(m.date);
      return d >= start && d <= end;
    });
    return {
      income: wMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0),
      expense: wMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0),
    };
  }, [selectedWeek, movements]);

  const personalMonthlyStats = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const mMovements = movements.filter(m => {
      const d = parseISO(m.date);
      return d >= start && d <= end;
    });
    return {
      income: mMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + m.amount, 0),
      expense: mMovements.filter(m => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0),
    };
  }, [selectedMonth, movements]);

  const handleQuickExpense = async (amount: number, categoryName: string) => {
    if (accounts.length === 0) {
      alert('Primero crea una cuenta en la pestaña "Cuentas"');
      return;
    }
    
    const account = accounts[0]; // Use first account as default
    const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    let catId = category?.id;

    if (!category) {
      try {
        const docRef = await addDoc(collection(db, 'categories'), { name: categoryName, userId: account.userId });
        catId = docRef.id;
      } catch (err) {
        console.error("Error creating category on the fly:", err);
        return;
      }
    }

    const newMovement: Omit<Movement, 'id'> = {
      type: 'expense',
      amount,
      categoryId: catId!,
      accountOriginId: account.id,
      date: new Date().toISOString(),
      userId: account.userId
    };

    try {
      await runTransaction(db, async (transaction) => {
        const accountRef = doc(db, 'accounts', account.id);
        const accountSnap = await transaction.get(accountRef);
        if (!accountSnap.exists()) return;
        
        const currentBalance = accountSnap.data().balance;
        transaction.update(accountRef, { balance: currentBalance - amount });
        transaction.set(doc(collection(db, 'movements')), newMovement);
      });
    } catch (error) {
      console.error("Error adding quick expense:", error);
    }
  };

  const handleAiParse = async () => {
    const apiKey = userProfile?.geminiApiKey || process.env.GEMINI_API_KEY;
    
    if (!aiInput.trim() || !apiKey) {
      if (!apiKey) setAiError('Configura tu Gemini API Key en Ajustes');
      return;
    }

    setIsAiLoading(true);
    setAiError('');

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Analiza este texto de gasto y devuelve un JSON con: amount (número), category (nombre de categoría), note (opcional). 
      Categorías disponibles: ${categories.map(c => c.name).join(', ')}. 
      Texto: "${aiInput}"`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      if (result.amount && result.category) {
        const category = categories.find(c => c.name.toLowerCase().includes(result.category.toLowerCase()));
        if (category) {
          await handleQuickExpense(result.amount, category.name);
          setAiInput('');
          alert('Gasto registrado con éxito vía IA');
        } else {
          setAiError('No pude identificar la categoría');
        }
      } else {
        setAiError('No pude entender el monto o la categoría');
      }
    } catch (error) {
      console.error("AI Parse Error:", error);
      setAiError('Error al procesar con IA');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleMarkAsPaid = async (payment: RecurringPayment) => {
    if (!payment.id) return;
    try {
      const paymentRef = doc(db, 'recurringPayments', payment.id);
      await updateDoc(paymentRef, { isPaid: true });
      
      // Also register as a movement
      const category = categories.find(c => c.id === payment.categoryId);
      if (category && accounts.length > 0) {
        await handleQuickExpense(payment.amount, category.name);
      }
    } catch (error) {
      console.error("Error marking as paid:", error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-32"
    >
      {/* Install App Banner */}
      {!window.matchMedia('(display-mode: standalone)').matches && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-[2.5rem] border flex items-center justify-between gap-4 transition-all duration-500 mb-2",
            darkMode ? "bg-purple-600/20 border-purple-500/30" : "bg-purple-50 border-purple-100"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className={cn("text-xs font-black uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Instalar App</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Acceso directo en tu inicio</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                  console.log('User accepted the install prompt');
                }
              } else {
                alert('Para instalar: \n1. Toca el botón de compartir \n2. Selecciona "Añadir a pantalla de inicio"');
              }
            }}
            className={cn(
              "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
              darkMode ? "bg-purple-600 text-white" : "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
            )}
          >
            Instalar
          </button>
        </motion.div>
      )}
      {/* Upcoming Payments - MOVED TO TOP */}
      {recurringPayments.length > 0 && recurringPayments.some(p => !p.isPaid) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-rose-500" />
              <h3 className={cn("font-black text-xl uppercase tracking-widest", darkMode ? "text-white" : "text-slate-900")}>Pagos Pendientes</h3>
            </div>
            <button 
              onClick={() => setIsRecurringModalOpen(true)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                darkMode ? "bg-zinc-800 text-purple-400 hover:bg-zinc-700" : "bg-white text-purple-600 border border-slate-100 shadow-sm"
              )}
            >
              Gestionar
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recurringPayments.filter(p => !p.isPaid).map((payment) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "min-w-[200px] p-4 rounded-3xl border flex items-center justify-between gap-4 shrink-0",
                  darkMode ? "glass-card border-rose-500/20 bg-rose-500/5" : "bg-rose-50 border-rose-100"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={cn("text-xs font-black uppercase tracking-tight truncate max-w-[80px]", darkMode ? "text-white" : "text-slate-900")}>{payment.name}</p>
                    <p className="text-[8px] font-bold text-rose-500 uppercase tracking-widest">
                      {format(parseISO(payment.dueDate), 'dd MMM', { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
                    S/ {payment.amount}
                  </p>
                  <button 
                    onClick={() => handleMarkAsPaid(payment)}
                    className="text-[8px] font-black uppercase text-purple-500 hover:underline"
                  >
                    Pagar
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Today Summary */}
      <section className="grid grid-cols-2 gap-4">
        <div className={cn(
          "p-4 rounded-3xl border transition-all duration-300",
          darkMode ? "glass-card border-emerald-500/20 bg-emerald-500/5" : "bg-emerald-50 border-emerald-100"
        )}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Ingresos Hoy</p>
            <button 
              onClick={() => setSummaryModal({ open: true, type: 'income' })}
              className="p-1 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <Table className="w-3.5 h-3.5 text-emerald-500/50 hover:text-emerald-500" />
            </button>
          </div>
          <p className="text-xl font-black font-display tracking-tighter text-emerald-500">S/ {stats.dailyIncome.toLocaleString()}</p>
        </div>
        <div className={cn(
          "p-4 rounded-3xl border transition-all duration-300",
          darkMode ? "glass-card border-rose-500/20 bg-rose-500/5" : "bg-rose-50 border-rose-100"
        )}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Gastos Hoy</p>
            <button 
              onClick={() => setSummaryModal({ open: true, type: 'expense' })}
              className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
            >
              <Table className="w-3.5 h-3.5 text-rose-500/50 hover:text-rose-500" />
            </button>
          </div>
          <p className="text-xl font-black font-display tracking-tighter text-rose-500">S/ {stats.dailyExpense.toLocaleString()}</p>
        </div>
      </section>

      {/* AI Smart Input */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h3 className={cn("font-black text-xl uppercase tracking-widest", darkMode ? "text-white" : "text-slate-900")}>Registro Inteligente</h3>
        </div>
        <div className={cn(
          "p-4 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100 shadow-sm"
        )}>
          <div className="flex gap-2">
            <input 
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder='Ej: "Gasté 15 en pasaje"'
              className={cn(
                "flex-1 bg-transparent border-none p-2 text-sm font-medium focus:ring-0",
                darkMode ? "text-white placeholder:text-slate-600" : "text-slate-900 placeholder:text-slate-400"
              )}
            />
            <button 
              onClick={handleAiParse}
              disabled={isAiLoading}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-95",
                darkMode ? "bg-purple-600 text-white" : "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
              )}
            >
              {isAiLoading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
            </button>
          </div>
          {aiError && <p className="text-[10px] text-rose-500 font-bold mt-2 px-2 uppercase tracking-widest">{aiError}</p>}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className={cn("font-black text-xl uppercase tracking-widest", darkMode ? "text-white" : "text-slate-900")}>Gastos Rápidos</h3>
          <button 
            onClick={() => {
              setEditingQuickAction(null);
              setIsQuickActionModalOpen(true);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
              darkMode ? "bg-zinc-800 text-purple-400 hover:bg-zinc-700" : "bg-white text-purple-600 border border-slate-100 shadow-sm"
            )}
          >
            + Agregar
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((item) => {
            const IconComponent = (LucideIcons as any)[item.icon] || DollarSign;
            return (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.02 }}
                className="relative group"
              >
                <button
                  onClick={() => handleQuickExpense(item.amount, item.label)}
                  className={cn(
                    "w-full p-4 rounded-3xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                    darkMode ? "glass-card border-zinc-800/50 hover:bg-zinc-900" : "glass-card-light border-slate-100 shadow-sm hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center",
                    darkMode ? "bg-purple-500/10 text-purple-400" : "bg-purple-50 text-purple-600"
                  )}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-[10px] font-black uppercase tracking-tighter truncate w-full", darkMode ? "text-slate-300" : "text-slate-900")}>{item.label}</p>
                    <p className="text-[9px] font-bold text-purple-500 font-display tracking-tighter">S/ {item.amount}</p>
                  </div>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingQuickAction(item);
                    setIsQuickActionModalOpen(true);
                  }}
                  className="absolute -top-1 -right-1 p-1.5 bg-white dark:bg-zinc-800 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-slate-100 dark:border-zinc-700"
                >
                  <Edit3 className="w-3 h-3 text-purple-500" />
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      <RecurringPaymentModal 
        isOpen={isRecurringModalOpen} 
        onClose={() => setIsRecurringModalOpen(false)} 
        categories={categories}
        userId={userProfile?.id || ''}
        darkMode={darkMode}
        recurringPayments={recurringPayments}
      />
      
      <QuickActionModal 
        isOpen={isQuickActionModalOpen}
        onClose={() => setIsQuickActionModalOpen(false)}
        darkMode={darkMode}
        userId={userProfile?.id || ''}
        editingAction={editingQuickAction}
      />

      <SummaryTableModal 
        isOpen={summaryModal.open}
        onClose={() => setSummaryModal({ ...summaryModal, open: false })}
        movements={movements}
        categories={categories}
        darkMode={darkMode}
        type={summaryModal.type}
      />

      {/* Hero Balance Section */}
      <section className="relative group">
        <div className={cn(
          "p-5 rounded-3xl border transition-all duration-500 relative overflow-hidden",
          darkMode 
            ? "bg-purple-600 border-purple-500 shadow-[0_20px_60px_rgba(168,85,247,0.4)]" 
            : "glass-card-light border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)]"
        )}>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className={cn("text-[10px] font-black uppercase tracking-[0.4em]", darkMode ? "text-purple-100/60" : "text-slate-400")}>Balance Total</p>
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", darkMode ? "bg-white/10" : "bg-purple-50")}>
                <Wallet className={cn("w-4 h-4", darkMode ? "text-white" : "text-purple-600")} />
              </div>
            </div>
            <h2 className={cn("text-3xl font-black font-display tracking-tighter mb-1", darkMode ? "text-white" : "text-slate-900")}>
              S/ {stats.totalBalance.toLocaleString()}
            </h2>
            <div className="flex items-center gap-6 mt-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className={cn("text-[9px] font-black uppercase tracking-widest", darkMode ? "text-purple-100/60" : "text-slate-400")}>Ingresos</p>
                  <button 
                    onClick={() => setSummaryModal({ open: true, type: 'income' })}
                    className="p-1 rounded-lg hover:bg-emerald-500/10 transition-colors"
                  >
                    <Table className={cn("w-3 h-3", darkMode ? "text-emerald-400/50 hover:text-emerald-400" : "text-emerald-500/50 hover:text-emerald-500")} />
                  </button>
                </div>
                <p className="text-lg font-black font-display text-emerald-400">+S/ {stats.monthlyIncome.toLocaleString()}</p>
              </div>
              <div className={cn("w-px h-8", darkMode ? "bg-white/10" : "bg-slate-100")}></div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className={cn("text-[9px] font-black uppercase tracking-widest", darkMode ? "text-purple-100/60" : "text-slate-400")}>Gastos</p>
                  <button 
                    onClick={() => setSummaryModal({ open: true, type: 'expense' })}
                    className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <Table className={cn("w-3 h-3", darkMode ? "text-rose-300/50 hover:text-rose-300" : "text-rose-500/50 hover:text-rose-500")} />
                  </button>
                </div>
                <p className={cn("text-lg font-black font-display", darkMode ? "text-rose-300" : "text-rose-500")}>-S/ {stats.monthlyExpense.toLocaleString()}</p>
              </div>
              <div className={cn("w-px h-8", darkMode ? "bg-white/10" : "bg-slate-100")}></div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className={cn("text-[9px] font-black uppercase tracking-widest", darkMode ? "text-purple-100/60" : "text-slate-400")}>Neto</p>
                </div>
                <p className={cn("text-lg font-black font-display", (stats.monthlyIncome - stats.monthlyExpense) >= 0 ? "text-emerald-400" : darkMode ? "text-rose-300" : "text-rose-500")}>
                  {(stats.monthlyIncome - stats.monthlyExpense) >= 0 ? '+' : '-'}S/ {Math.abs(stats.monthlyIncome - stats.monthlyExpense).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-400/20 rounded-full blur-2xl -ml-16 -mb-16"></div>
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section className="grid grid-cols-2 gap-4">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddMovement('expense')}
          className={cn(
            "group relative overflow-hidden p-5 rounded-[2rem] border transition-all duration-500 flex flex-col items-start gap-3",
            darkMode ? "glass-card border-slate-800/50 hover:bg-slate-800/80" : "glass-card-light border-slate-100 shadow-sm hover:shadow-md"
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center transition-transform group-hover:scale-110">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-0.5">Nuevo</p>
            <h4 className={cn("text-base font-black font-display uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Gasto</h4>
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-colors"></div>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddMovement('income')}
          className={cn(
            "group relative overflow-hidden p-5 rounded-[2rem] border transition-all duration-500 flex flex-col items-start gap-3",
            darkMode ? "glass-card border-slate-800/50 hover:bg-slate-800/80" : "glass-card-light border-slate-100 shadow-sm hover:shadow-md"
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center transition-transform group-hover:scale-110">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-0.5">Nuevo</p>
            <h4 className={cn("text-base font-black font-display uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>Ingreso</h4>
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors"></div>
        </motion.button>
      </section>

      {/* Hero Balance Section */}
      {/* Income/Expense Panels */}
      <section className="space-y-6">
        <h3 className={cn("font-black text-xl uppercase tracking-widest px-1 transition-colors", darkMode ? "text-white" : "text-slate-900")}>Resumen Financiero</h3>
        <div className="grid grid-cols-1 gap-5">
          {/* Today - Independent Selector */}
          <div className={cn(
            "p-5 rounded-[2rem] border transition-all duration-300 relative overflow-hidden text-left w-full",
            darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">
                  {isSameDay(selectedDay, new Date()) ? 'Hoy' : 'Día Seleccionado'}
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedDay(addDays(selectedDay, -1))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <p className={cn("text-xs font-bold uppercase tracking-tight", darkMode ? "text-purple-300" : "text-purple-600")}>
                    {format(selectedDay, "EEEE, d 'de' MMMM", { locale: es })}
                  </p>
                  <button 
                    onClick={() => setSelectedDay(addDays(selectedDay, 1))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", darkMode ? "bg-zinc-900" : "bg-purple-50")}>
                <CalendarIcon className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Ingresos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {personalDailyStats.income.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Gastos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {personalDailyStats.expense.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-1">Neto</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", (personalDailyStats.income - personalDailyStats.expense) >= 0 ? "text-emerald-400" : darkMode ? "text-rose-400" : "text-rose-600")}>
                  {(personalDailyStats.income - personalDailyStats.expense) >= 0 ? '+' : '-'}S/ {Math.abs(personalDailyStats.income - personalDailyStats.expense).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Weekly - Independent Selector */}
          <div className={cn(
            "p-5 rounded-[2rem] border transition-all duration-300 relative overflow-hidden text-left w-full",
            darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Semana Personalizada</p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedWeek(addDays(selectedWeek, -7))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <p className={cn("text-xs font-bold uppercase tracking-tight", darkMode ? "text-emerald-300" : "text-emerald-600")}>
                    {format(startOfWeek(selectedWeek, { weekStartsOn: 0 }), 'd MMM')} - {format(endOfWeek(selectedWeek, { weekStartsOn: 0 }), 'd MMM')}
                  </p>
                  <button 
                    onClick={() => setSelectedWeek(addDays(selectedWeek, 7))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", darkMode ? "bg-zinc-900" : "bg-emerald-50")}>
                <CalendarIcon className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Ingresos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {personalWeeklyStats.income.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Gastos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {personalWeeklyStats.expense.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-1">Neto</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", (personalWeeklyStats.income - personalWeeklyStats.expense) >= 0 ? "text-emerald-400" : darkMode ? "text-rose-400" : "text-rose-600")}>
                  {(personalWeeklyStats.income - personalWeeklyStats.expense) >= 0 ? '+' : '-'}S/ {Math.abs(personalWeeklyStats.income - personalWeeklyStats.expense).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly - Independent Selector */}
          <div className={cn(
            "p-5 rounded-[2rem] border transition-all duration-300 relative overflow-hidden text-left w-full",
            darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Mes Seleccionado</p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <p className={cn("text-xs font-bold uppercase tracking-tight", darkMode ? "text-amber-300" : "text-amber-600")}>
                    {format(selectedMonth, 'MMMM yyyy', { locale: es })}
                  </p>
                  <button 
                    onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                    className={cn("p-1 rounded-lg", darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100")}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", darkMode ? "bg-zinc-900" : "bg-amber-50")}>
                <CalendarIcon className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Ingresos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-emerald-400" : "text-emerald-600")}>+S/ {personalMonthlyStats.income.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Gastos</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", darkMode ? "text-rose-400" : "text-rose-600")}>-S/ {personalMonthlyStats.expense.toLocaleString()}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800/50"></div>
              <div>
                <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-1">Neto</p>
                <p className={cn("text-2xl font-black font-display tracking-tighter", (personalMonthlyStats.income - personalMonthlyStats.expense) >= 0 ? "text-emerald-400" : darkMode ? "text-rose-400" : "text-rose-600")}>
                  {(personalMonthlyStats.income - personalMonthlyStats.expense) >= 0 ? '+' : '-'}S/ {Math.abs(personalMonthlyStats.income - personalMonthlyStats.expense).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Insights */}
      <section className="grid grid-cols-2 gap-5">
        <div className={cn(
          "p-6 rounded-[2.5rem] border transition-all duration-300",
          darkMode ? "bg-black/40 border-zinc-800/50" : "bg-white border-slate-100 shadow-sm"
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
          darkMode ? "bg-black/40 border-zinc-800/50" : "bg-white border-slate-100 shadow-sm"
        )}>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Ahorro Mes</p>
          <p className={cn("text-xl font-black font-display tracking-tighter", darkMode ? "text-white" : "text-slate-900")}>
            S/ {Math.max(0, stats.monthlyIncome - stats.monthlyExpense).toLocaleString()}
          </p>
        </div>
      </section>

      {/* Weekly Category Spending */}
      {stats.weeklyCategoryExpenses.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className={cn("font-black text-xl uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Gastos por Categoría</h3>
              <span className="bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">PRO</span>
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Esta Semana</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {stats.weeklyCategoryExpenses.map((cat, idx) => (
              <motion.div 
                key={cat.categoryId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between group",
                  darkMode ? "glass-card border-zinc-800/50 hover:bg-zinc-900/80" : "glass-card-light border-slate-100 shadow-sm",
                  cat.amount === 0 && "opacity-40 grayscale-[0.5]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                    darkMode ? "bg-purple-500/10 text-purple-400" : "bg-purple-50 text-purple-600",
                    cat.amount === 0 && (darkMode ? "bg-zinc-800/50 text-zinc-600" : "bg-slate-100 text-slate-400")
                  )}>
                    <PieChart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-black uppercase tracking-tight", darkMode ? "text-white" : "text-slate-900")}>{cat.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      {cat.amount > 0 ? 'Gasto semanal' : 'Sin gastos esta semana'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-lg font-black font-display tracking-tighter", 
                    cat.amount > 0 
                      ? (darkMode ? "text-rose-400" : "text-rose-600") 
                      : (darkMode ? "text-slate-500" : "text-slate-400")
                  )}>
                    -S/ {cat.amount.toLocaleString()}
                  </p>
                  {cat.amount > 0 && (
                    <div className="w-24 h-1 bg-zinc-800/30 rounded-full mt-1 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (cat.amount / stats.weeklyExpense) * 100)}%` }}
                        className="h-full bg-rose-500"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <h3 className={cn("font-black text-xl uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Actividad Reciente</h3>
          <button onClick={() => setActiveTab('stats')} className="text-[11px] font-black text-purple-500 uppercase tracking-[0.2em]">Ver Todo</button>
        </div>
        <div className="space-y-4">
          {movements.slice(0, 5).map(m => (
            <MovementItem 
              key={m.id} 
              movement={m} 
              categories={categories} 
              accounts={accounts} 
              darkMode={darkMode} 
              onDelete={onDeleteMovement}
            />
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

function CalendarView({ 
  movements, 
  accounts, 
  categories, 
  darkMode, 
  onDelete,
  selectedDate,
  setSelectedDate,
  viewingDate,
  setViewingDate
}: { 
  movements: Movement[], 
  accounts: Account[], 
  categories: Category[], 
  darkMode: boolean, 
  onDelete?: (m: Movement) => void,
  selectedDate: Date,
  setSelectedDate: (d: Date) => void,
  viewingDate: Date,
  setViewingDate: (d: Date) => void
}) {

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    const days = [];
    let curr = start;
    
    // Add padding for the first day of the week
    const startPadding = start.getDay();
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    while (curr <= end) {
      days.push(new Date(curr));
      curr = addDays(curr, 1);
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

  const selectedDayStats = useMemo(() => {
    const dateKey = format(viewingDate, 'yyyy-MM-dd');
    return dailyStats[dateKey] || { income: 0, expense: 0 };
  }, [viewingDate, dailyStats]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-14 pb-32"
    >
      {/* Calendar Header */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className={cn("text-3xl font-black font-display uppercase tracking-tighter transition-colors", darkMode ? "text-white" : "text-slate-900")}>
              {format(selectedDate, 'MMMM', { locale: es })}
            </h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">{format(selectedDate, 'yyyy')}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedDate(subMonths(selectedDate, 1))}
              className={cn("p-3 rounded-2xl transition-all active:scale-90", darkMode ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-white text-slate-600 border border-slate-100 shadow-sm")}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
              className={cn("p-3 rounded-2xl transition-all active:scale-90", darkMode ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-white text-slate-600 border border-slate-100 shadow-sm")}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                setSelectedDate(now);
                setViewingDate(now);
              }}
              className={cn("px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-90", darkMode ? "bg-purple-600 text-white" : "bg-purple-500 text-white shadow-lg shadow-purple-500/20")}
            >
              Hoy
            </button>
          </div>
        </div>

        <div className={cn(
          "p-6 rounded-[3rem] border transition-all duration-500",
          darkMode ? "glass-card border-slate-800/50 shadow-2xl shadow-purple-900/10" : "glass-card-light border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.03)]"
        )}>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
              <div key={`weekday-header-${i}`} className="text-center text-[10px] font-black text-slate-400 py-1 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="aspect-square" />;
              
              const dateKey = format(day, 'yyyy-MM-dd');
              const stat = dailyStats[dateKey];
              const isSelected = isSameDay(day, viewingDate);
              const isToday = isSameDay(day, new Date());
              
              return (
                <button 
                  key={dateKey}
                  onClick={() => setViewingDate(day)}
                  className={cn(
                    "aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative group",
                    isSelected 
                      ? "bg-purple-600 text-white shadow-xl shadow-purple-500/40 scale-110 z-10" 
                      : isToday 
                        ? (darkMode ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-purple-50 text-purple-600 border border-purple-100")
                        : (darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-50 text-slate-600")
                  )}
                >
                  <span className="text-sm font-black font-display">{day.getDate()}</span>
                  <div className="flex gap-0.5">
                    {stat?.income > 0 && <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-emerald-500")} />}
                    {stat?.expense > 0 && <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-rose-500")} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Selected Day Details */}
      <section className="space-y-8">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Actividad del</p>
            <h3 className={cn("text-2xl font-black font-display uppercase tracking-tighter transition-colors", darkMode ? "text-white" : "text-slate-900")}>
              {format(viewingDate, "d 'de' MMMM", { locale: es })}
            </h3>
          </div>
          <div className="flex gap-3">
            {selectedDayStats.income > 0 && (
              <div className="flex flex-col items-end">
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Ingresos</p>
                <p className="text-sm font-black font-display text-emerald-500">+S/ {selectedDayStats.income}</p>
              </div>
            )}
            {selectedDayStats.expense > 0 && (
              <div className="flex flex-col items-end">
                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest">Gastos</p>
                <p className="text-sm font-black font-display text-rose-500">-S/ {selectedDayStats.expense}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {movementsForDay.length > 0 ? (
            movementsForDay.map(m => (
              <MovementItem 
                key={m.id} 
                movement={m} 
                categories={categories}
                accounts={accounts}
                darkMode={darkMode}
                onDelete={onDelete}
              />
            ))
          ) : (
            <div className={cn(
              "p-12 rounded-[3rem] border border-dashed text-center transition-all duration-500",
              darkMode ? "bg-slate-900/20 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className={cn("text-[10px] font-black uppercase tracking-[0.4em]", darkMode ? "text-slate-600" : "text-slate-400")}>Sin movimientos registrados</p>
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

  const weeklyExpenses = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const weeks = [
      { name: 'Día 1-7', total: 0 },
      { name: 'Día 8-14', total: 0 },
      { name: 'Día 15-21', total: 0 },
      { name: 'Día 22+', total: 0 }
    ];

    movements
      .filter(m => m.type === 'expense')
      .forEach(m => {
        const date = parseISO(m.date);
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
          const day = date.getDate();
          if (day <= 7) weeks[0].total += m.amount;
          else if (day <= 14) weeks[1].total += m.amount;
          else if (day <= 21) weeks[2].total += m.amount;
          else weeks[3].total += m.amount;
        }
      });
    return weeks;
  }, [movements]);

  const totalIncome = useMemo(() => movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements]);
  const totalExpense = useMemo(() => movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements]);
  const balance = totalIncome - totalExpense;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Estadísticas</h2>
        <div className="flex gap-2">
          <div className="px-4 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            Pro Analytics
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={cn(
          "p-6 rounded-3xl border transition-all duration-300",
          darkMode ? "glass-card border-slate-800/50 shadow-purple-500/5" : "glass-card-light border-slate-100 shadow-sm"
        )}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Ingresos</p>
          <p className="text-2xl font-extrabold font-display text-emerald-500 tracking-tighter">S/ {totalIncome.toLocaleString()}</p>
        </div>
        <div className={cn(
          "p-6 rounded-3xl border transition-all duration-300",
          darkMode ? "glass-card border-slate-800/50 shadow-purple-500/5" : "glass-card-light border-slate-100 shadow-sm"
        )}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Gastos</p>
          <p className="text-2xl font-extrabold font-display text-rose-500 tracking-tighter">S/ {totalExpense.toLocaleString()}</p>
        </div>
        <div className={cn(
          "col-span-2 p-6 rounded-3xl border flex items-center justify-between transition-all duration-300",
          darkMode ? "bg-purple-900/20 border-purple-500/20" : "bg-purple-50 border-purple-100"
        )}>
          <div>
            <p className="text-[11px] font-bold text-purple-400 uppercase tracking-widest mb-2">Balance Neto</p>
            <p className={cn("text-3xl font-extrabold font-display tracking-tighter", balance >= 0 ? "text-emerald-500" : "text-rose-500")}>
              S/ {balance.toLocaleString()}
            </p>
          </div>
          <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center">
            <TrendingUp className="text-purple-500 w-7 h-7" />
          </div>
        </div>
      </div>
      
      <div className={cn(
        "p-6 rounded-3xl border transition-all duration-300",
        darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Gastos por Categoría</h3>
          <PieChart className="w-4 h-4 text-purple-500" />
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

      {/* Weekly Expenses Section */}
      <div className={cn(
        "p-6 rounded-3xl border transition-all duration-300",
        darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Gastos por Semana (Mes Actual)</h3>
          <CalendarIcon className="w-4 h-4 text-purple-500" />
        </div>
        <div className="space-y-4">
          {weeklyExpenses.map((week, idx) => {
            const maxTotal = Math.max(...weeklyExpenses.map(w => w.total), 1);
            const percentage = (week.total / maxTotal) * 100;
            return (
              <div key={week.name} className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <span className={cn("text-[10px] font-black uppercase tracking-widest", darkMode ? "text-slate-400" : "text-slate-500")}>
                    {week.name}
                  </span>
                  <span className={cn("text-xs font-black font-display tracking-tight", darkMode ? "text-white" : "text-slate-900")}>
                    S/ {week.total.toLocaleString()}
                  </span>
                </div>
                <div className={cn("h-2 rounded-full overflow-hidden", darkMode ? "bg-zinc-900" : "bg-slate-100")}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className="h-full bg-purple-600 rounded-full"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn(
        "p-6 rounded-3xl border transition-all duration-300",
        darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100 shadow-sm"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Flujo de Caja (6 meses)</h3>
          <BarChartIcon className="w-4 h-4 text-purple-500" />
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
      "p-3.5 rounded-xl border flex items-center justify-between transition-all duration-300 group overflow-hidden relative",
      darkMode ? "glass-card border-slate-800/50 hover:border-purple-500/30" : "glass-card-light border-slate-100 shadow-sm hover:border-purple-100"
    )}>
      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm" style={{ backgroundColor: `${acc.color}15`, color: acc.color }}>
          <Icon className="w-6 h-6" />
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
          darkMode ? "bg-purple-600 text-white shadow-purple-900/40" : "bg-purple-600 text-white shadow-purple-200"
        )}>
          <Plus className="w-8 h-8" />
        </button>
      </div>

      {/* Bancos Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl transition-colors duration-300 relative overflow-hidden",
                darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
              )}
            >
              {/* Decorative background blobs for modal */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="flex items-center justify-between">
                <h2 className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-slate-900")}>Nueva Cuenta</h2>
                <button onClick={() => setIsModalOpen(false)} className={cn(
                  "p-1.5 rounded-full transition-colors",
                  darkMode ? "hover:bg-zinc-900 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
                )}><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleAdd} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Nombre</label>
                  <input type="text" placeholder="Ej. BCP Ahorros" value={name} onChange={e => setName(e.target.value)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-purple-500 transition-colors",
                    darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                  )} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Tipo de Cuenta</label>
                  <select value={type} onChange={e => setType(e.target.value as AccountType)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-purple-500 transition-colors",
                    darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                  )}>
                    {Object.keys(ACCOUNT_ICONS).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Saldo Inicial</label>
                  <input type="number" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} className={cn(
                    "w-full border-none rounded-xl py-2 px-4 text-xs focus:ring-2 focus:ring-purple-500 transition-colors",
                    darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
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
                <button className="w-full bg-purple-600 text-white py-2.5 rounded-xl font-bold shadow-lg shadow-purple-100 dark:shadow-purple-900/20 mt-2 active:scale-95 transition-transform text-xs">Crear Cuenta</button>
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
          "w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl transition-colors duration-300 relative overflow-hidden",
          darkMode ? "glass-card border-slate-800/50" : "glass-card-light border-slate-100"
        )}
      >
        {/* Decorative background blobs for modal */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={cn("text-lg font-black font-display uppercase tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>Aportar a Meta</h2>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{goal.name}</p>
          </div>
          <button onClick={onClose} className={cn(
            "p-1.5 rounded-xl transition-colors",
            darkMode ? "hover:bg-zinc-900 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
          )}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleContribute} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Monto a Aportar</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-purple-500">S/</span>
              <input 
                type="number" 
                placeholder="0.00" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                className={cn(
                  "w-full border-none rounded-xl py-3.5 pl-10 pr-4 text-xl font-black font-display focus:ring-2 focus:ring-purple-500 transition-colors",
                  darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                )} 
                autoFocus
                required 
              />
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
              <span className="text-slate-500">Nuevo Progreso</span>
              <span className="text-purple-500">
                {Math.min(100, ((goal.currentAmount + (parseFloat(amount) || 0)) / goal.targetAmount) * 100).toFixed(1)}%
              </span>
            </div>
            <div className={cn("h-2 rounded-full overflow-hidden", darkMode ? "bg-zinc-900" : "bg-slate-100")}>
              <div 
                className="h-full bg-purple-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((goal.currentAmount + (parseFloat(amount) || 0)) / goal.targetAmount) * 100)}%` }}
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-14 pb-32"
    >
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className={cn("text-xl font-black font-display uppercase tracking-widest transition-colors", darkMode ? "text-white" : "text-slate-900")}>Mis Metas Pro</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Planificación de alto nivel</p>
        </div>
        <button onClick={() => { setEditingGoal(null); setIsModalOpen(true); }} className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90",
          darkMode ? "bg-purple-600 text-white shadow-purple-900/40" : "bg-purple-600 text-white shadow-purple-200"
        )}>
          <Plus className="w-8 h-8" />
        </button>
      </div>

      {/* Goal Analytics Panel */}
      <section className={cn(
        "p-8 rounded-[2.5rem] border transition-all duration-300 relative overflow-hidden",
        darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100 shadow-sm"
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
            <p className="text-2xl font-black font-display text-purple-500 tracking-tighter">S/ {totalSaved.toLocaleString()}</p>
          </div>
        </div>
        <div className={cn("h-4 rounded-full overflow-hidden mb-6", darkMode ? "bg-zinc-900" : "bg-slate-100")}>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            className="h-full bg-gradient-to-r from-purple-600 to-purple-600 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)]"
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
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
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                  : darkMode ? "bg-zinc-900 text-slate-400 border border-zinc-800" : "bg-white text-slate-500 border border-slate-100 shadow-sm"
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
                "p-5 rounded-[2rem] border shadow-sm space-y-6 transition-all duration-300 relative overflow-hidden group",
                darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
              )}
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
                    darkMode ? "bg-purple-900/40 text-purple-400" : "bg-purple-50 text-purple-600"
                  )}>
                    <Target className="w-6 h-6" />
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
                      darkMode ? "bg-zinc-900 text-slate-400 hover:text-white" : "bg-slate-50 text-slate-500 hover:text-purple-600"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(goal.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100",
                      darkMode ? "bg-zinc-900 text-rose-400 hover:bg-rose-500 hover:text-white" : "bg-slate-50 text-rose-500 hover:bg-rose-50"
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
                <div className={cn("h-3 rounded-full overflow-hidden transition-colors", darkMode ? "bg-zinc-900" : "bg-slate-100")}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className={cn(
                      "h-full rounded-full shadow-[0_0_15px_rgba(79,70,229,0.4)]",
                      isCompleted ? "bg-emerald-500" : "bg-purple-600"
                    )}
                  />
                </div>
                <div className="flex justify-between items-end pt-2">
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ahorrado</p>
                    <p className={cn("text-lg font-black font-display tracking-tighter", darkMode ? "text-purple-400" : "text-purple-600")}>
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
                  className="w-full py-3 bg-purple-600/10 hover:bg-purple-600 text-purple-600 hover:text-white border border-purple-600/20 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-95"
                >
                  Aportar a esta meta
                </button>
              )}

              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
            </motion.div>
          );
        })}
        {goals.length === 0 && (
          <div className={cn(
            "border border-dashed rounded-[2.5rem] p-12 text-center transition-colors",
            darkMode ? "bg-black/50 border-zinc-800" : "bg-slate-50 border-slate-200"
          )}>
            <div className="w-16 h-16 bg-slate-200 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "w-full max-w-md rounded-[2.5rem] p-8 space-y-6 shadow-2xl transition-colors duration-300 relative overflow-hidden",
                darkMode ? "glass-card border-zinc-800/50" : "glass-card-light border-slate-100"
              )}
            >
              {/* Decorative background blobs for modal */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={cn("text-xl font-black font-display uppercase tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-900")}>
                    {editingGoal ? 'Editar Meta Pro' : 'Nueva Meta Pro'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuración avanzada</p>
                </div>
                <button onClick={() => { setIsModalOpen(false); setEditingGoal(null); }} className={cn(
                  "p-2 rounded-xl transition-colors",
                  darkMode ? "hover:bg-zinc-900 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600"
                )}><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleAddOrUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nombre de la Meta</label>
                    <input type="text" placeholder="Ej. Inversión Inmobiliaria" value={name} onChange={e => setName(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monto Objetivo</label>
                    <input type="number" placeholder="0.00" value={target} onChange={e => setTarget(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monto Actual</label>
                    <input type="number" placeholder="0.00" value={current} onChange={e => setCurrent(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Fecha Límite</label>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Prioridad</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )}>
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Categoría</label>
                    <input type="text" placeholder="Ej. Viajes, Hogar, Retiro" value={category} onChange={e => setCategory(e.target.value)} className={cn(
                      "w-full border-none rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-colors",
                      darkMode ? "bg-zinc-900 text-white" : "bg-slate-50 text-slate-900"
                    )} />
                  </div>
                </div>
                <button className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-500/20 mt-4 active:scale-95 transition-transform text-sm">
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
    </motion.div>
  );
}
