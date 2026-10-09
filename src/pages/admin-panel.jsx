import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Agro from '../services/agroData'
import { clearTokens } from '../services/authSession'
import useAuthSession from '../hooks/useAuthSession'
import useSounds from '../hooks/useSounds'
import { logoutUser, fetchUsers, createUser, updateUser, deleteUser, changeUserState } from '../services/authApi'
import { fetchCultivosEnProceso } from '../services/asignaciones-usuarioAPI'
import { getInventarioElementos } from '../utils/inventarioElementos'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import DynamicModal from '../components/DynamicModal'
import ReasonModal from '../components/ReasonModal'
import { StateFilterMenu } from '../components/StateFilters'
import { clearRentabilidadCharts, updateAdminDashboardCharts, updateRentabilidadCharts } from './admin/adminCharts'
import { AdminReportTable } from './admin/AdminReportViews'
import { exportReportToExcel, exportReportToPdf } from '../utils/reportExport'
import '../styles/dashboard.css'
import '../styles/admin-panel.css'
import { fetchFincas, createFinca, updateFinca, deleteFinca, changeFincaState } from '../services/fincaService'
import { fetchDashboardForFinca } from '../services/dashboardService'
import { fetchCultivosPorFinca, fetchTiposCultivo, fetchEstados, createCultivo, updateCultivo, deleteCultivo, fetchCultivoDetalle, fetchCategoriasCosto, fetchSubcategoriasPorCategoria, fetchEstadosPago, fetchUnidadesMedida, fetchTiposPrecio, fetchEtapaEnProcesoPorCultivo, fetchEtapasPorCultivo, validateCultivoForCost, createCosto, updateCosto, deleteCosto, fetchCostosPorFinca, fetchCosechasPorCultivo, createCosecha, updateCosecha, deleteCosecha, fetchAllEtapasCatalog, createEtapaForCultivo, updateEtapaForCultivo, deleteEtapaForCultivo, changeCostoState, changeCultivoState, changeEtapaState, changeCosechaState } from '../services/cultivoService'
import * as reportService from '../services/reportService'
import { filterCostsByCategoryId } from '../utils/costFilters'

import { MODAL_TYPES, DEPARTAMENTOS, MUNICIPIOS_POR_DEPARTAMENTO, normalizeModalTextFields } from '../utils/modalConfig'
import Swal from 'sweetalert2'

// Nombres de secciones que se usan en la navegación del panel admin.
// Esta constante asigna un identificador interno a un título visible.
const SECTION_TITLES = {
  dashboard: 'Dashboard',
  fincas: 'Gestión de Fincas',
  usuarios: 'Gestión de Usuarios',
  cultivos: 'Gestión de Cultivos',
  reportes: 'Reportes',
  costos: 'Costos Generales',
  rentabilidad: 'Análisis de Rentabilidad',
  configuracion: 'Configuración',
  alertas: 'Centro de Alertas',
}

// Convierte el nombre de una etapa en una clase CSS segura.
// Ejemplo: "Preparación Inicial" => "preparacion-inicial".
function etapaClassName(nombre) {
  return nombre
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
}

function isValidFincaId(value) {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0
}

function formatDateValue(value) {
  if (!value) return '--'
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return value
  return parsedDate.toISOString().slice(0, 10)
}

function formatCantidadValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const parsed = Number(String(value).replace(/,/g, '.'))
  if (Number.isNaN(parsed)) return String(value)
  return parsed.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
}

function capitalizeWords(value) {
  if (value == null) return '--'
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')
}

function parseMoneyValue(value) {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let str = String(value).trim()
  if (!str) return 0
  const negative = str.includes('-')
  str = str.replace(/\s+/g, '').replace(/[^0-9.,]/g, '')
  if (!str) return 0

  const hasDot = str.includes('.')
  const hasComma = str.includes(',')

  if (hasDot && hasComma) {
    const lastComma = str.lastIndexOf(',')
    str = str.slice(0, lastComma).replace(/[.,]/g, '')
  } else if (hasDot) {
    const parts = str.split('.')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/\./g, '')
    } else {
      const decimalMatch = str.match(/(\.(\d{1,2}))$/)
      str = decimalMatch ? str.slice(0, decimalMatch.index) : str.replace(/\./g, '')
    }
  } else if (hasComma) {
    const parts = str.split(',')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/,/g, '')
    } else {
      const decimalMatch = str.match(/(,(\d{1,2}))$/)
      str = decimalMatch ? str.slice(0, decimalMatch.index) : str.replace(/,/g, '')
    }
  }

  const normalized = str.replace(/[.,]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0
}

function formatPrecioValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  const amount = parseMoneyValue(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
    : String(value)
}

function normalizeNumericInputValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const parsed = parseMoneyValue(value)
  return Number.isFinite(parsed) ? String(parsed) : String(value).trim()
}

function normalizeSelectValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeCosecha(cosecha) {
  if (!cosecha || typeof cosecha !== 'object') return cosecha

  const extractId = (value) => {
    if (value == null || value === '') return ''
    if (typeof value === 'object') {
      return value.id ?? value.value ?? ''
    }
    return value
  }

  const unidadId =
    extractId(cosecha.unidadId) ||
    extractId(cosecha.unidadMedidaId) ||
    extractId(cosecha.unidadmedidaid) ||
    extractId(cosecha.idunidadmedida) ||
    extractId(cosecha.unidad_medida) ||
    extractId(cosecha.unidad) ||
    extractId(cosecha.unidad?.id) ||
    ''
  const tipoPrecioId =
    extractId(cosecha.tipoPrecioId) ||
    extractId(cosecha.tipoprecioid) ||
    extractId(cosecha.idtipo_precio) ||
    extractId(cosecha.tipo_precio) ||
    extractId(cosecha.tipoPrecio) ||
    ''
  const unidadLabel =
    cosecha.unidad?.nombre ||
    cosecha.unidad ||
    cosecha.unidad_medida ||
    cosecha.unidadMedida ||
    ''
  const tipoPrecioLabel =
    cosecha.tipoPrecio?.nombre ||
    cosecha.tipoPrecio ||
    cosecha.tipo_precio ||
    cosecha.tipoprecio ||
    ''

  return {
    ...cosecha,
    cantidad: cosecha.cantidad ?? cosecha.cantidad_cosechada ?? '',
    precio: cosecha.precio ?? cosecha.precio_unitario ?? '',
    unidad_medida: normalizeSelectValue(unidadId),
    tipo_precio: normalizeSelectValue(tipoPrecioId),
    unidad: unidadLabel,
    tipoPrecio: tipoPrecioLabel,
  }
}

function formatDateForInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// Colores fijos para las 4 categorías generales y utilidades para subcategorías
const CATEGORY_COLORS = {
  'Mano de Obra': '#2E7D32', // verde oscuro
  'Materia Prima': '#1565C0', // azul
  'Servicios': '#6A1B9A', // morado
  'Costos Indirectos': '#FF6F00', // naranja oscuro
}

// Normaliza cadenas para comparaciones (quita acentos, caracteres no alfanuméricos, y normaliza espacios)
function normalizeKey(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const CATEGORY_MAP = Object.fromEntries(
  Object.keys(CATEGORY_COLORS).map((k) => [normalizeKey(k), k])
)

const MONTH_OPTIONS = [
  { value: '', label: 'Todos los meses' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [
  { value: '', label: 'Todos los años' },
  ...Array.from({ length: 15 }, (_, index) => ({
    value: String(CURRENT_YEAR - index),
    label: String(CURRENT_YEAR - index),
  })),
]

function lightenHex(hex, percent) {
  try {
    const amount = Math.round(255 * percent)
    const num = parseInt(hex.replace('#', ''), 16)
    let r = (num >> 16) + amount
    let g = ((num >> 8) & 0x00FF) + amount
    let b = (num & 0x0000FF) + amount
    r = Math.min(255, Math.max(0, r))
    g = Math.min(255, Math.max(0, g))
    b = Math.min(255, Math.max(0, b))
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
  } catch (e) {
    return hex
  }
}

const COSTOS_GENERALES_ROWS = [
  {
    fecha: '10/04/2026',
    categoria: 'Mano de Obra',
    descripcion: 'Pago de jornales - Abril 2026',
    monto: '$1,200,000',
    estado: 'finalizado',
    estadoLabel: 'Pagado',
  },
  {
    fecha: '09/04/2026',
    categoria: 'Materia Prima',
    descripcion: 'Compra de fertilizante NPK 15-15-15',
    monto: '$850,000',
    estado: 'finalizado',
    estadoLabel: 'Pagado',
  },
  {
    fecha: '08/04/2026',
    categoria: 'Servicios',
    descripcion: 'Servicio fumigación - Control plagas',
    monto: '$450,000',
    estado: 'en-proceso',
    estadoLabel: 'Pendiente',
  },
  {
    fecha: '07/04/2026',
    categoria: 'Costos Indirectos',
    descripcion: 'Mantenimiento maquinaria agrícola',
    monto: '$320,000',
    estado: 'finalizado',
    estadoLabel: 'Pagado',
  },
]

export default function AdminPanel() {
  // Hook para cambiar de ruta cuando el usuario no tiene permiso o cierra sesión.
  const navigate = useNavigate()
  // Sesión actual del usuario; se usa para validar rol de administrador.
  const session = useAuthSession()
  // Hook para efectos de sonido de retroalimentación auditiva
  const { playSuccess, playError, playDisable, playWarning } = useSounds()
  const accountFullName = [session?.nombre, session?.apellidos].filter(Boolean).join(' ') || session?.email || 'Cuenta'

  const [darkModeEnabled, setDarkModeEnabled] = useState(() => {
    const stored = localStorage.getItem('darkModeEnabled')
    return stored !== null ? stored === 'true' : false
  })

  // Estado local del componente administrado por React.
  // fincaId guarda la finca seleccionada actualmente.
  const [fincaId, setFincaId] = useState(() => {
    const initial = Agro.getSelectedFincaId()
    return isValidFincaId(initial) ? String(initial) : ''
  })
  const [activeSection, setActiveSection] = useState(() => {
    return localStorage.getItem('activeSection') || 'dashboard'
  })
  // Título que se muestra en la cabecera según la sección activa.
  const [pageTitle, setPageTitle] = useState(() => {
    const initial = localStorage.getItem('activeSection') || 'dashboard'
    return SECTION_TITLES[initial] || 'Dashboard'
  })
  const [selectedCultivoId, setSelectedCultivoId] = useState(() => {
    const storedId = localStorage.getItem('selectedCultivoId')
    return storedId ? Number(storedId) : null
  })
  // El usuario seleccionado para ver asignaciones de fincas/cultivos.
  const [activeUsuarioId, setActiveUsuarioId] = useState(null)
  // Controla si se muestran las asignaciones de usuario.
  const [asignacionesOpen, setAsignacionesOpen] = useState(false)
  // Estado para mostrar información detallada de inventario en costos de cultivo.
  const [elementosCultivo, setElementosCultivo] = useState({ open: false, rows: [] })
  // Estado para mostrar información detallada de inventario en costos generales.
  const [elementosGenerales, setElementosGenerales] = useState({ open: false, rows: [] })
  // Controla si el panel de reportes está visible.
  const [reportVisible, setReportVisible] = useState(false)
  // Tipo de reporte seleccionado para generar contenido.
  const [reportType, setReportType] = useState(null)
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('')
  const [filtroFechaFin, setFiltroFechaFin] = useState('')
  const [filtroCultivo, setFiltroCultivo] = useState('')
  const [filtroCategoriaCosto, setFiltroCategoriaCosto] = useState('')
  const [filtroSubcategoriaCosto, setFiltroSubcategoriaCosto] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroEstadoCultivo, setFiltroEstadoCultivo] = useState('')
  const [searchCultivoTerm, setSearchCultivoTerm] = useState('')
  const [filterOptions, setFilterOptions] = useState({ cultivos: [], usuarios: [], estados: [], categorias: [], subcategorias: [] })
  const [estadoOptions, setEstadoOptions] = useState([])
  const [reportData, setReportData] = useState(null)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [reportMessage, setReportMessage] = useState(null)
  // Variable para forzar recarga de fincas cuando se agrega una nueva.
  const [fincasRefresh, setFincasRefresh] = useState(0)
  // Controla la apertura del modal dinámico.
  const [showDynamicModal, setShowDynamicModal] = useState(false)
  // Tipo de modal dinámico que se muestra (usuario, cultivo, costo, finca).
  const [dynamicModalType, setDynamicModalType] = useState(null)
  // Usuario que está siendo editado actualmente.
  const [editingUser, setEditingUser] = useState(null)
  // Lista de usuarios cargados desde el backend.
  const [users, setUsers] = useState([])
  // Opciones dinámicas para los campos del modal.
  const [modalFieldOptions, setModalFieldOptions] = useState({})
  // Datos de fincas y cultivos para mostrar las asignaciones reales.
  const [fincasData, setFincasData] = useState([])
  const [cultivosData, setCultivosData] = useState([])

  const [modalInitialData, setModalInitialData] = useState(undefined)
  const [fincas, setFincas] = useState([])
  const [fincasSelectorOptions, setFincasSelectorOptions] = useState([])
  const [isLoadingFincasSelector, setIsLoadingFincasSelector] = useState(true)
  const [fincasSelectorError, setFincasSelectorError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoadingFincas, setIsLoadingFincas] = useState(false)
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  const [dashboardMonth, setDashboardMonth] = useState('')
  const [dashboardYear, setDashboardYear] = useState('')
  const [cultivos, setCultivos] = useState([])
  const [isLoadingCultivos, setIsLoadingCultivos] = useState(false)
  const [editingFinca, setEditingFinca] = useState(null)
  const [editingCultivo, setEditingCultivo] = useState(null)
  const [detalleCostos, setDetalleCostos] = useState([])
  const [isLoadingDetalleCostos, setIsLoadingDetalleCostos] = useState(false)
  const [editingCosto, setEditingCosto] = useState(null)
  const [costoFilterEtapa, setCostoFilterEtapa] = useState('todos')
  const [costoFilterCategoria, setCostoFilterCategoria] = useState('todos')
  const [costoFilterEstadoPago, setCostoFilterEstadoPago] = useState('todos')
  const [costoFilterFechaDesde, setCostoFilterFechaDesde] = useState('')
  const [costoFilterFechaHasta, setCostoFilterFechaHasta] = useState('')
  const [costoCategoriaOptions, setCostoCategoriaOptions] = useState([])
  const [costoEstadoPagoOptions, setCostoEstadoPagoOptions] = useState([])

  const [costosGenerales, setCostosGenerales] = useState([])
  const [isLoadingCostosGenerales, setIsLoadingCostosGenerales] = useState(false)
  const [generalCostoFilterCategoria, setGeneralCostoFilterCategoria] = useState('todos')
  const [generalCostoFilterEstadoPago, setGeneralCostoFilterEstadoPago] = useState('todos')
  const [generalCostoFilterCultivo, setGeneralCostoFilterCultivo] = useState('todos')
  const [generalCostoFilterUsuario, setGeneralCostoFilterUsuario] = useState('todos')
  const [generalCostoFilterFechaDesde, setGeneralCostoFilterFechaDesde] = useState('')
  const [generalCostoFilterFechaHasta, setGeneralCostoFilterFechaHasta] = useState('')
  const [detalleCosechas, setDetalleCosechas] = useState([])
  const [isLoadingDetalleCosechas, setIsLoadingDetalleCosechas] = useState(false)
  const [editingCosecha, setEditingCosecha] = useState(null)
  const [cosechaFilterFechaDesde, setCosechaFilterFechaDesde] = useState('')
  const [cosechaFilterFechaHasta, setCosechaFilterFechaHasta] = useState('')
  const [cosechaUnidadOptions, setCosechaUnidadOptions] = useState([])
  const [cosechaTipoPrecioOptions, setCosechaTipoPrecioOptions] = useState([])

  // Estado para los filtros de estado_registro
  const [fincasEstado, setFincasEstado] = useState('ACTIVO')
  const [usuariosEstado, setUsuariosEstado] = useState('ACTIVO')
  const [cultivosEstado, setCultivosEstado] = useState('ACTIVO')
  const [costosGeneralesEstado, setCostosGeneralesEstado] = useState('ACTIVO')
  const [etapasEstado, setEtapasEstado] = useState('ACTIVO')
  const [detalleCostosEstado, setDetalleCostosEstado] = useState('ACTIVO')
  const [detalleCosechasEstado, setDetalleCosechasEstado] = useState('ACTIVO')

  // Modal de motivo para cambios de estado
  const [reasonModal, setReasonModal] = useState({
    isOpen: false,
    title: '',
    question: '',
    callback: null,
    cancelCallback: null,
  })

  // Memoize initial data for DynamicModal to avoid recreating object each render
  const memoizedModalInitialData = useMemo(() => {
    if (!editingUser) return undefined
    return {
      nombre: editingUser.nombre || '',
      apellidos: editingUser.apellidos || '',
      correo: editingUser.email || '',
      contraseña: editingUser.password || '',
      rol: editingUser.rol?.toLowerCase() || '',
      fincas: Array.isArray(editingUser.fincas) ? editingUser.fincas.map(Number).filter(Boolean) : [],
      cultivos: Array.isArray(editingUser.cultivos) ? editingUser.cultivos.map(Number).filter(Boolean) : [],
    }
  }, [editingUser])

  const dynamicModalInitialData = modalInitialData ?? memoizedModalInitialData

  // Refs para elementos DOM y gráficos.
  const dashboardRequestIdRef = useRef(0)
  const cpRef = useRef(null)
  const ccRef = useRef(null)
  const ccatRef = useRef(null)
  const crRef = useRef(null)
  const crdRef = useRef(null)
  const cicRef = useRef(null)

  // Valida que el usuario tenga rol de admin; si no, lo redirige al login.
  useEffect(() => {
    if (!session || session.role !== 'admin') {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  // Escucha el evento global de cambio de finca y actualiza el estado local.
  useEffect(() => {
    const handler = (event) => setFincaId(event.detail?.fincaId ?? Agro.getSelectedFincaId())
    window.addEventListener('agro:fincaChanged', handler)
    return () => window.removeEventListener('agro:fincaChanged', handler)
  }, [])

  // Carga opciones dinámicas para filtros (cultivos, usuarios, estados, categorias)
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const res = await reportService.fetchReportFilters(fincaId)
        if (res && res.success) {
          setFilterOptions({
            cultivos: [],
            usuarios: [],
            estados: [],
            categorias: [],
            subcategorias: [],
            ...res.data,
          })
        } else {
          console.warn('No se pudieron cargar filtros de reportes', res)
        }
      } catch (err) {
        console.error('Error cargando filtros:', err)
      }
    }
    loadFilters()
  }, [fincaId])

  useEffect(() => {
    const loadEstados = async () => {
      try {
        const estadosResponse = await fetchEstados()
        const estadosArray = estadosResponse?.success ? estadosResponse.data : Array.isArray(estadosResponse) ? estadosResponse : estadosResponse?.data || []
        setEstadoOptions(estadosArray)
      } catch (err) {
        console.error('Error cargando estados:', err)
      }
    }
    loadEstados()
  }, [])

  // Carga la lista de usuarios desde el backend al iniciar el componente.
  useEffect(() => {
    const loadUsers = async () => {
      const response = await fetchUsers(usuariosEstado)
      if (response.success) {
        const usersWithNormalizedAssignments = response.data.map((user) => ({
          ...user,
          fincas: Array.isArray(user.fincas) ? user.fincas.map(Number).filter(Boolean) : [],
          cultivos: Array.isArray(user.cultivos) ? user.cultivos.map(Number).filter(Boolean) : [],
        }))
        setUsers(usersWithNormalizedAssignments)
      } else {
        console.error('Error al cargar usuarios:', response.message)
      }
    }

    loadUsers()
  }, [usuariosEstado])

  // Re-fetch fincas when estado filter changes
  useEffect(() => {
    fetchFincasList('')
  }, [])

  useEffect(() => {
    const loadAssignmentOptions = async () => {
      const [fincasResponse, cultivosResponse] = await Promise.all([
        fetchFincas(),
        fetchCultivosEnProceso(),
      ])

      // Normalize fincasResponse to an array of fincas
      const fincasArray = fincasResponse?.success
        ? fincasResponse.data
        : Array.isArray(fincasResponse)
        ? fincasResponse
        : fincasResponse?.data || []

      // Normalize cultivosResponse to an array of cultivos
      const cultivosArray = cultivosResponse?.success
        ? cultivosResponse.data
        : Array.isArray(cultivosResponse)
        ? cultivosResponse
        : cultivosResponse?.data || []

      const fincasOptions = fincasArray.map((finca) => ({ value: finca.id, label: finca.nombre }))

      const cultivosOptions = cultivosArray.map((cultivo) => ({
        value: cultivo.id,
        label: `${cultivo.nombre}`,
        description: `Finca: ${cultivo.finca_nombre || 'No asignada'}`,
        idfinca: cultivo.idfinca,
      }))

      setModalFieldOptions({ fincas: fincasOptions, cultivos: cultivosOptions })
      setFincasData(fincasArray)
      setCultivosData(cultivosArray)
    }

    loadAssignmentOptions()
  }, [])

  useEffect(() => {
    const loadCostoOptions = async () => {
      try {
        const [categoriasResponse, estadosPagoResponse] = await Promise.all([
          fetchCategoriasCosto(),
          fetchEstadosPago(),
        ])

        const categoriasArray = categoriasResponse?.success
          ? categoriasResponse.data
          : Array.isArray(categoriasResponse)
          ? categoriasResponse
          : categoriasResponse?.data || []

        const estadosPagoArray = estadosPagoResponse?.success
          ? estadosPagoResponse.data
          : Array.isArray(estadosPagoResponse)
          ? estadosPagoResponse
          : estadosPagoResponse?.data || []

        setCostoCategoriaOptions(categoriasArray)
        setCostoEstadoPagoOptions(estadosPagoArray)
      } catch (error) {
        console.error('Error cargando opciones de costos:', error)
      }
    }

    loadCostoOptions()
  }, [])

  useEffect(() => {
    const loadCosechaOptions = async () => {
      try {
        const [unidadesResponse, tiposPrecioResponse] = await Promise.all([
          fetchUnidadesMedida(),
          fetchTiposPrecio(),
        ])

        const unidadesArray = unidadesResponse?.success
          ? unidadesResponse.data
          : Array.isArray(unidadesResponse)
          ? unidadesResponse
          : unidadesResponse?.data || []

        const tiposPrecioArray = tiposPrecioResponse?.success
          ? tiposPrecioResponse.data
          : Array.isArray(tiposPrecioResponse)
          ? tiposPrecioResponse
          : tiposPrecioResponse?.data || []

        setCosechaUnidadOptions(unidadesArray)
        setCosechaTipoPrecioOptions(tiposPrecioArray)
      } catch (error) {
        console.error('Error cargando opciones de cosechas:', error)
      }
    }

    loadCosechaOptions()
  }, [])

  // Muestra una notificación rápida en pantalla.
  const showNotification = useCallback((message, type = 'info') => {
    if (type === 'success') {
      playSuccess()
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type,
      title: message,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
    })
  }, [playSuccess])

    const fetchDashboardData = useCallback(
    async (selectedFincaId, month, year) => {
        const requestId = ++dashboardRequestIdRef.current
      const fincaNumericId = Number(selectedFincaId)
      if (!Number.isInteger(fincaNumericId) || fincaNumericId <= 0) {
          setDashboardData(null)
          setDashboardError('Selecciona una finca válida para consultar Rentabilidad.')
          setIsLoadingDashboard(false)
          return
        }

        setDashboardData(null)
        setDashboardError(null)
        setIsLoadingDashboard(true)
      try {
          const data = await fetchDashboardForFinca(fincaNumericId, { month, year })
          if (requestId !== dashboardRequestIdRef.current) return
        setDashboardData(data)
        setDashboardError(null)
      } catch (error) {
          if (requestId !== dashboardRequestIdRef.current) return
          console.error('[admin-panel] Error cargando dashboard', {
            fincaId: fincaNumericId,
            month,
            year,
            status: error.cause?.response?.status,
            error,
          })
        setDashboardData(null)
          setDashboardError(error.message || 'No se pudo cargar el dashboard.')
      } finally {
          if (requestId === dashboardRequestIdRef.current) setIsLoadingDashboard(false)
      }
    },
    []
  )

  const fetchCultivosData = useCallback(
    async (selectedFincaId) => {
      if (!selectedFincaId) return
      const fincaNumericId = Number(selectedFincaId)
      if (!Number.isInteger(fincaNumericId) || fincaNumericId <= 0) return
      try {
        setIsLoadingCultivos(true)
        console.log('[admin-panel] fetchCultivosData -> requesting cultivos for fincaId=', fincaNumericId, 'estado=', cultivosEstado)
        console.log('[admin-panel] fetchCultivosData -> finca record in fincasData:', (fincasData || []).find((f) => Number(f.id) === Number(fincaNumericId)))
        const data = await fetchCultivosPorFinca(fincaNumericId, cultivosEstado)
        console.log('[admin-panel] fetchCultivosData -> response', data)
        setCultivos(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error al cargar cultivos:', error)
        setCultivos([])
      } finally {
        setIsLoadingCultivos(false)
      }
    },
    [cultivosEstado]
  )

  useEffect(() => {
    if (!selectedCultivoId) {
      setDetalleCostos([])
      setIsLoadingDetalleCostos(false)
      return
    }

    const loadDetalleCostos = async () => {
      try {
        setIsLoadingDetalleCostos(true)
        const detalle = await fetchCultivoDetalle(selectedCultivoId)
        setDetalleCostos(Array.isArray(detalle) ? detalle : [])
      } catch (error) {
        console.error('Error cargando detalle de costos del cultivo:', error)
        setDetalleCostos([])
      } finally {
        setIsLoadingDetalleCostos(false)
      }
    }

    loadDetalleCostos()
  }, [selectedCultivoId])

  useEffect(() => {
    const loadCostosGenerales = async () => {
      if (!fincaId) {
        setCostosGenerales([])
        setIsLoadingCostosGenerales(false)
        return
      }
      try {
        setIsLoadingCostosGenerales(true)
        const data = await fetchCostosPorFinca(Number(fincaId))
        setCostosGenerales(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error cargando costos generales:', error)
        setCostosGenerales([])
      } finally {
        setIsLoadingCostosGenerales(false)
      }
    }

    loadCostosGenerales()
  }, [fincaId])

  useEffect(() => {
    if (!selectedCultivoId) {
      setDetalleCosechas([])
      setIsLoadingDetalleCosechas(false)
      return
    }

    const loadDetalleCosechas = async () => {
      try {
        setIsLoadingDetalleCosechas(true)
        const detalle = await fetchCosechasPorCultivo(selectedCultivoId)
        setDetalleCosechas(Array.isArray(detalle) ? detalle.map(normalizeCosecha) : [])
      } catch (error) {
        console.error('Error cargando cosechas del cultivo:', error)
        setDetalleCosechas([])
      } finally {
        setIsLoadingDetalleCosechas(false)
      }
    }

    loadDetalleCosechas()
  }, [selectedCultivoId])

  const refreshCultivoDetalleData = useCallback(async () => {
    if (!selectedCultivoId) return

    try {
      const [etapas, detalle, cosechas] = await Promise.all([
        fetchEtapasPorCultivo(selectedCultivoId),
        fetchCultivoDetalle(selectedCultivoId),
        fetchCosechasPorCultivo(selectedCultivoId),
      ])

      setEtapasCultivo(sortEtapasForDisplay(Array.isArray(etapas) ? etapas : []))
      setDetalleCostos(Array.isArray(detalle) ? detalle : [])
      setDetalleCosechas(Array.isArray(cosechas) ? cosechas.map(normalizeCosecha) : [])
    } catch (error) {
      console.error('Error recargando datos del detalle del cultivo:', error)
    }
  }, [selectedCultivoId])

  useEffect(() => {
    setCostoFilterEtapa('todos')
    setCostoFilterCategoria('todos')
    setCostoFilterEstadoPago('todos')
    setCostoFilterFechaDesde('')
    setCostoFilterFechaHasta('')
    setCosechaFilterFechaDesde('')
    setCosechaFilterFechaHasta('')
  }, [selectedCultivoId])

  const openAddEtapaModal = async () => {
    if (!selectedCultivoId) {
      await Swal.fire({ title: 'AgroGestion', text: 'Selecciona un cultivo primero.', icon: 'warning', confirmButtonText: 'Aceptar', confirmButtonColor: '#dc3545' })
      return
    }
    try {
      const list = await fetchAllEtapasCatalog()
      const etapasArr = Array.isArray(list) ? list : []
      setEtapasCatalog(etapasArr)
      // Prepare DynamicModal options and open it
      setModalFieldOptions((prev) => ({
        ...prev,
        idetapa: etapasArr.map((e) => ({ value: String(e.id), label: e.nombre })),
      }))
      setModalInitialData({
        idetapa: '',
        descripcion: '',
      })
      setDynamicModalType(MODAL_TYPES.ETAPA)
      setShowDynamicModal(true)
    } catch (e) {
      console.error('Error cargando catálogo de etapas:', e)
      showNotification('No se pudo cargar el catálogo de etapas', 'error')
    }
  }

  const handleSubmitAddEtapa = async (formData) => {
    const idetapa = Number(String(formData.idetapa || '').trim())
    const descripcion = String(formData.descripcion || '')
    if (!Number.isInteger(idetapa) || idetapa <= 0) {
      showNotification('Selecciona una etapa válida', 'error')
      return
    }
    try {
      setIsSavingEtapa(true)
      const current = await fetchEtapaEnProcesoPorCultivo(selectedCultivoId)
      const hasEnProceso = current && ((Array.isArray(current) && current.length) || current.id || current.idetapacultivo)
      let forceFinalize = false
      if (hasEnProceso) {
        const result = await Swal.fire({
          title: 'AgroGestion',
          text: 'Para registrar esta nueva etapa se finalizará la etapa que se encuentra actualmente en proceso. ¿Estás seguro de que deseas agregar la nueva etapa?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, agregar nueva etapa',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#ffffff',
          customClass: {
            cancelButton: 'custom-cancel-btn',
            confirmButton: 'custom-confirm-btn',
          },
        })
        if (!result.isConfirmed) {
          setIsSavingEtapa(false)
          return
        }
        forceFinalize = true
      }

      const res = await createEtapaForCultivo(selectedCultivoId, { idetapa, descripcion, forceFinalize })
      if (res && res.success) {
        showNotification('Etapa registrada correctamente', 'success')
        await refreshCultivoDetalleData()
        // close DynamicModal
        setShowDynamicModal(false)
        setDynamicModalType(null)
      } else {
        console.error('Error creando etapa:', res)
        showNotification(res?.message || 'Error creando etapa', 'error')
      }
    } catch (e) {
      console.error('Error creando etapa:', e)
      const message = e?.response?.data?.message || e?.message || 'Error creando etapa'
      showNotification(message, 'error')
    } finally {
      setIsSavingEtapa(false)
    }
  }

  useEffect(() => {
    if (!selectedCultivoId) {
      setEtapasCultivo([])
      setIsLoadingEtapas(false)
      return
    }

    const loadEtapas = async () => {
      try {
        setIsLoadingEtapas(true)
        const list = await fetchEtapasPorCultivo(selectedCultivoId)
        setEtapasCultivo(sortEtapasForDisplay(Array.isArray(list) ? list : []))
      } catch (e) {
        console.error('Error cargando etapas del cultivo:', e)
        setEtapasCultivo([])
      } finally {
        setIsLoadingEtapas(false)
      }
    }

    loadEtapas()
  }, [selectedCultivoId])

  // Función para abrir el modal de editar etapa
  const handleOpenEditEtapa = async (etapa) => {
    try {
      // Cargar catálogo de etapas
      const list = await fetchAllEtapasCatalog()
      const etapasArr = Array.isArray(list) ? list : []

      // Cargar estados
      const estadosResponse = await fetchEstados()
      const estadosArr = estadosResponse?.success ? estadosResponse.data : Array.isArray(estadosResponse) ? estadosResponse : estadosResponse?.data || []

      // Filtrar solo "En Proceso" y "Finalizado"
      const estadosFiltrados = estadosArr.filter((e) => {
        const nombre = (e.nombre || '').toLowerCase()
        return nombre === 'en proceso' || nombre === 'finalizado'
      })

      // Encontrar el ID de la etapa basándose en el nombre
      const etapaCatalog = etapasArr.find((e) => e.nombre === etapa.nombre)
      const idetapaValue = etapaCatalog ? String(etapaCatalog.id) : String(etapa.idetapa || '')
      const editingEtapaData = {
        ...etapa,
        id: etapa?.id ?? etapa?.idetapacultivo ?? etapa?.idetapa_cultivo,
        idetapacultivo: etapa?.idetapacultivo ?? etapa?.id,
      }

      setEditingEtapa(editingEtapaData)
      setModalFieldOptions({
        idetapa: etapasArr.map((e) => ({ value: String(e.id), label: e.nombre })),
        idestado: estadosFiltrados.map((s) => ({ value: s.id, label: s.nombre })),
      })

      setModalInitialData({
        idetapa: idetapaValue,
        idestado: String(etapa.idestado || ''),
        descripcion: etapa.descripcion || '',
      })
      setDynamicModalType(MODAL_TYPES.ETAPA)
      setShowDynamicModal(true)
    } catch (e) {
      console.error('Error preparando edición de etapa:', e)
      showNotification('Error al cargar datos de la etapa', 'error')
    }
  }

  // Función para actualizar una etapa existente
  const handleSubmitEditEtapa = async (formData) => {
    const idestado = Number(String(formData.idestado || '').trim())
    const descripcion = String(formData.descripcion || '')

    if (!editingEtapa) {
      showNotification('Error: No hay etapa seleccionada para editar', 'error')
      return
    }

    try {
      setIsSavingEtapa(true)

      const updateData = {}

      // Verificar si el estado cambió
      const estadoCambio = idestado && idestado !== editingEtapa.idestado

      if (estadoCambio) {
        // Cargar estados para obtener información
        const estadosResponse = await fetchEstados()
        const estadosArr = estadosResponse?.success ? estadosResponse.data : Array.isArray(estadosResponse) ? estadosResponse : estadosResponse?.data || []
        const estadoEnProceso = estadosArr.find((e) => e.nombre?.toLowerCase() === 'en proceso')

        const willSetEnProceso = idestado === estadoEnProceso?.id && editingEtapa.idestado !== estadoEnProceso?.id

        if (willSetEnProceso) {
          const result = await Swal.fire({
            title: 'AgroGestion',
            text: 'Para editar esta etapa se finalizará la etapa que se encuentra actualmente en proceso. ¿Estás seguro de que deseas editar el estado de la etapa?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, actualizar etapa',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#ffffff',
            customClass: {
              cancelButton: 'custom-cancel-btn',
              confirmButton: 'custom-confirm-btn',
            },
          })

          if (!result.isConfirmed) {
            setIsSavingEtapa(false)
            return
          }

          updateData.forceFinalize = true
          updateData.forceEnProceso = true
        }
      }

      if (descripcion) {
        updateData.descripcion = descripcion
      }

      const idetapa = Number(String(formData.idetapa || '').trim())
      if (idetapa && Number.isInteger(idetapa) && idetapa > 0) {
        updateData.idetapa = idetapa
      }

      if (idestado) {
        updateData.idestado = idestado
      }

      const etapaId = Number(
        editingEtapa?.id ??
        editingEtapa?.idetapacultivo ??
        editingEtapa?.idetapa_cultivo ??
        editingEtapa?.idEtapaCultivo
      )
      if (!etapaId || Number.isNaN(etapaId)) {
        console.error('editingEtapa inválida al actualizar etapa:', editingEtapa)
        showNotification('ID de etapa inválido para actualizar', 'error')
        setIsSavingEtapa(false)
        return
      }

      const res = await updateEtapaForCultivo(etapaId, updateData, {
        forceFinalize: updateData.forceFinalize === true,
        forceEnProceso: updateData.forceEnProceso === true,
      })

      if (res && res.success) {
        showNotification('Etapa actualizada correctamente', 'success')
        await refreshCultivoDetalleData()
        if (fincaId) {
          fetchCultivosData(fincaId)
        }
        setShowDynamicModal(false)
        setDynamicModalType(null)
        setEditingEtapa(null)
      } else {
        console.error('Error actualizando etapa:', res)
        showNotification(res?.message || 'Error actualizando etapa', 'error')
        playError()
      }
    } catch (e) {
      console.error('Error actualizando etapa:', e)
      const message = e?.response?.data?.message || e?.message || 'Error actualizando etapa'
      showNotification(message, 'error')
      playError()
    } finally {
      setIsSavingEtapa(false)
    }
  }

  const handleDeleteEtapa = async (etapa) => {
    const etapaId = Number(
      etapa?.id ??
      etapa?.idetapacultivo ??
      etapa?.idetapa_cultivo ??
      etapa?.idEtapaCultivo
    )

    if (!etapaId || Number.isNaN(etapaId)) {
      console.error('ID de etapa inválido al anular etapa:', etapa)
      showNotification('ID de etapa inválido para anular', 'error')
      return
    }

    playWarning()
    const confirmed = await Swal.fire({
      title: 'Etapa 🚫',
      text: `Esta etapa dejará de participar en el seguimiento del cultivo.\n\nSi solo necesita corregir información, puede editar la etapa sin anularla.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Anular Etapa',
      question: 'Indica el motivo por el cual se anula la etapa',
      callback: async (motivo) => {
        try {
          const res = await changeEtapaState(etapaId, 'ANULADO', motivo)
          if (res && res.success) {
            showNotification('Etapa anulada correctamente', 'success')
            await refreshCultivoDetalleData()
          } else {
            console.error('Error anulando etapa:', res)
            showNotification(res?.message || 'Error anulando etapa', 'error')
            playError()
          }
        } catch (error) {
          console.error('Error anulando etapa:', error)
          const message = error?.response?.data?.message || error?.message || 'Error anulando etapa'
          showNotification(message, 'error')
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  const fetchFincasList = useCallback(
    async (search = '') => {
      try {
        setIsLoadingFincas(true)
        const lista = await fetchFincas(search, fincasEstado)
        const fincasArray = Array.isArray(lista) ? lista : Array.isArray(lista?.data) ? lista.data : []
        setFincas(fincasArray)
        // IMPORTANT: No debemos modificar la finca activa global con base en la lista filtrada.
        // La finca activa del sistema depende únicamente del selector del aside.
        // Por eso, no se ajusta `fincaId` aquí.
        void fincasArray
      } catch (error) {
        console.error(error)
        showNotification('No se pudo cargar la lista de fincas', 'error')
      } finally {
        setIsLoadingFincas(false)
      }
    },
    [fincaId, showNotification, fincasEstado]
  )

  const fetchFincasSelectorOptions = useCallback(
    async () => {
      setIsLoadingFincasSelector(true)
      setFincasSelectorError(null)
      try {
        const lista = await fetchFincas('', 'ACTIVO')
        const fincasArray = Array.isArray(lista) ? lista : Array.isArray(lista?.data) ? lista.data : []
        const fincasReales = fincasArray.filter((finca) => isValidFincaId(finca.id))
        setFincasSelectorOptions(fincasReales)
        if (fincasReales.length === 0) {
          setFincasSelectorError('No hay fincas activas disponibles para consultar el dashboard.')
        }
      } catch (error) {
        console.error('Error cargando opciones de fincas para selector:', error)
        setFincasSelectorOptions([])
        setFincasSelectorError('No se pudieron cargar las fincas reales. Intenta nuevamente.')
      } finally {
        setIsLoadingFincasSelector(false)
      }
    },
    []
  )

  useEffect(() => {
    localStorage.setItem('darkModeEnabled', darkModeEnabled)
    if (darkModeEnabled) {
      document.documentElement.classList.add('dark-mode')
    } else {
      document.documentElement.classList.remove('dark-mode')
    }
  }, [darkModeEnabled])

  useEffect(() => {
    fetchFincasSelectorOptions()
  }, [fetchFincasSelectorOptions])

  useEffect(() => {
    if (isLoadingFincasSelector) return

    const selectedFincaExists = fincasSelectorOptions.some(
      (finca) => isValidFincaId(finca.id) && String(finca.id) === String(fincaId)
    )
    if (selectedFincaExists) return

    const firstNumericFinca = fincasSelectorOptions.find((finca) => isValidFincaId(finca.id))
    if (!firstNumericFinca) {
      if (fincaId) {
        setFincaId('')
        Agro.setSelectedFincaId('')
      }
      return
    }

    const selectedId = String(Number(firstNumericFinca.id))
    setFincaId(selectedId)
    Agro.setSelectedFincaId(selectedId)
  }, [fincaId, fincasSelectorOptions, isLoadingFincasSelector])

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchFincasList(searchTerm)
    }, 300)
    return () => window.clearTimeout(id)
  }, [searchTerm, fetchFincasList, fincasRefresh, fincasEstado])

  useEffect(() => {
    if (isLoadingFincasSelector) return

    const selectedFincaExists = fincasSelectorOptions.some(
      (finca) => isValidFincaId(finca.id) && String(finca.id) === String(fincaId)
    )
    if (!selectedFincaExists) {
      dashboardRequestIdRef.current += 1
      setDashboardData(null)
      setDashboardError(
        fincasSelectorError || 'Selecciona una finca real disponible para consultar el dashboard.'
      )
      setIsLoadingDashboard(false)
      return
    }

    fetchDashboardData(fincaId, dashboardMonth, dashboardYear)
  }, [
    fincaId,
    fincasRefresh,
    dashboardMonth,
    dashboardYear,
    fetchDashboardData,
    fincasSelectorOptions,
    fincasSelectorError,
    isLoadingFincasSelector,
  ])

  useEffect(() => {
    fetchCultivosData(fincaId)
  }, [fincaId, fincasRefresh, fetchCultivosData])

  const handleBuscarFincas = () => {
    setSearchTerm('')
    fetchFincasList('')
  }

  const buildFiltersObject = (tipo) => ({
    fincaId: fincaId ? Number(fincaId) : null,
    cultivoId: filtroCultivo ? Number(filtroCultivo) : null,
    categoriaId: tipo !== 'produccion' && filtroCategoriaCosto ? Number(filtroCategoriaCosto) : null,
    subcategoriaId: tipo !== 'produccion' && filtroSubcategoriaCosto ? Number(filtroSubcategoriaCosto) : null,
    usuarioId: filtroUsuario ? Number(filtroUsuario) : null,
    estadoId: filtroEstadoCultivo ? Number(filtroEstadoCultivo) : null,
    fechaInicio: filtroFechaInicio || null,
    fechaFin: filtroFechaFin || null,
  })

  const fetchReport = useCallback(async (tipo) => {
    if (!tipo) return
    setIsLoadingReport(true)
    setReportMessage(null)
    try {
      const filters = buildFiltersObject(tipo)
      let res = null
      switch (tipo) {
        case 'por-cultivo':
          res = await reportService.fetchReportPorCultivo(filters)
          break
        case 'costos':
          res = await reportService.fetchReportCostos(filters)
          break
        case 'produccion':
          res = await reportService.fetchReportProduccion(filters)
          break
        case 'rentabilidad':
          res = await reportService.fetchReportRentabilidad(filters)
          break
        case 'trabajador':
          res = await reportService.fetchReportTrabajador(filters)
          break
        default:
          res = await reportService.fetchReportQuery(tipo, filters)
          break
      }

      if (!res || res.success === false) {
        setReportData([])
        setReportMessage(res?.error || 'Error ejecutando reporte')
      } else {
        setReportData(res.data || [])
        setReportMessage(res.message || null)
      }
    } catch (error) {
      console.error('fetchReport error', error)
      setReportData([])
      setReportMessage('Error de conexión')
    } finally {
      setIsLoadingReport(false)
    }
  }, [buildFiltersObject, fincaId, filtroCategoriaCosto, filtroCultivo, filtroEstadoCultivo, filtroFechaFin, filtroFechaInicio, filtroSubcategoriaCosto, filtroUsuario])

  const openReport = async (tipo) => {
    setReportType(tipo)
    setReportVisible(true)
    await fetchReport(tipo)
  }

  const handleOpenFincaModal = (finca = null) => {
    // prepare modal options and initial data
    // clear other editors to avoid stale modal data
    setEditingUser(null)
    setEditingCultivo(null)

    const [editDepartamento, editMunicipio] = (() => {
      if (!finca?.ubicacion) return ['', '']
      const parts = finca.ubicacion.split(',')
      const municipio = parts[0].trim()
      const departamento = parts.slice(1).join(',').trim()
      return [departamento, municipio]
    })()

    setEditingFinca(finca)
    setModalFieldOptions({
      departamento: DEPARTAMENTOS,
      municipio: MUNICIPIOS_POR_DEPARTAMENTO[editDepartamento] ? MUNICIPIOS_POR_DEPARTAMENTO[editDepartamento].map((m) => ({ value: m, label: m })) : [],
    })

    setModalInitialData({
      nombre: finca?.nombre || '',
      departamento: editDepartamento || '',
      municipio: editMunicipio || '',
    })

    setDynamicModalType(MODAL_TYPES.FINCA)
    setShowDynamicModal(true)
  }

  const handleOpenEditCultivo = async (cultivo) => {
    // Clear other editors and reset modal data
    setEditingUser(null)
    setEditingFinca(null)
    setModalInitialData({})

    setEditingCultivo(cultivo)
    setDynamicModalType(MODAL_TYPES.CULTIVO)

    setModalFieldOptions({ tipo: [], estado: [] })

    try {
      const [tiposResp, estadosResp] = await Promise.all([fetchTiposCultivo(), fetchEstados()])

      const tiposArray = tiposResp?.success ? tiposResp.data : Array.isArray(tiposResp) ? tiposResp : tiposResp?.data || []
      const estadosArray = estadosResp?.success ? estadosResp.data : Array.isArray(estadosResp) ? estadosResp : estadosResp?.data || []

      setModalFieldOptions({
        tipo: tiposArray.map((t) => ({ value: t.id, label: t.nombre })),
        estado: estadosArray.map((s) => ({ value: s.id, label: s.nombre })),
      })

      setModalInitialData({
        nombre: cultivo.nombre || '',
        tipo: cultivo.idtipocultivo || cultivo.idtipocultivo || '',
        fechaInicio: formatDateForInput(cultivo.fechaInicio || cultivo.fecha_inicio || cultivo.fechainicio),
        estado: cultivo.idestado || '',
      })
    } catch (error) {
      console.error('Error cargando datos para editar cultivo:', error)
      showNotification('Error cargando datos del cultivo', 'error')
    }

    setShowDynamicModal(true)
  }

  const countCultivosActivosByFinca = (fincaId) => {
    return cultivosData.filter((cultivo) => {
      const belongsToFinca = String(cultivo.idfinca || cultivo.fincaId) === String(fincaId)
      const isActivo = cultivo.idestado === 1 || (cultivo.estado && cultivo.estado.toLowerCase() !== 'finalizado')
      return belongsToFinca && isActivo
    }).length
  }

  const handleDeleteFinca = async (id) => {
    playWarning()
    const confirmed = await Swal.fire({
      title: 'Finca 📂',
      text: `Esta finca dejará de estar disponible para nuevas operaciones y pasará al historial.\n\nSi únicamente necesita corregir información, puede editar la finca sin archivarla.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, archivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Archivar Finca',
      question: 'Indica el motivo por el cual se archiva la finca',
      callback: async (motivo) => {
        try {
          await changeFincaState(id, 'ARCHIVADO', motivo)
          showNotification('Finca archivada correctamente', 'success')
          setFincasRefresh((prev) => prev + 1)
        } catch (error) {
          console.error(error)
          showNotification(error?.response?.data?.message || 'Error archivando la finca', 'error')
          playError()
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  // Filtra la lista de usuarios según el texto ingresado en el buscador.
  const filteredUsers = users.filter((usuario) => {
    if (!filtroUsuario) return true
    const filterValue = filtroUsuario.trim().toLowerCase()
    const nombreCompleto = `${usuario.nombre || ''} ${usuario.apellidos || ''}`.trim().toLowerCase()
    return nombreCompleto.includes(filterValue)
  })

  const activeUsuario = useMemo(
    () => users.find((usuario) => usuario.id === activeUsuarioId),
    [users, activeUsuarioId]
  )

  const fincasById = useMemo(
    () => Object.fromEntries(fincasData.map((finca) => [Number(finca.id), finca])),
    [fincasData]
  )

  const filteredCultivos = useMemo(() => {
    const filtered = cultivos.filter((cultivo) => {
      const cumpleEstado = !filtroEstadoCultivo || filtroEstadoCultivo === 'todos' || Number(cultivo.idestado) === Number(filtroEstadoCultivo)
      const cultivoNombre = String(cultivo.nombre || '')
      const cumpleBusqueda = !searchCultivoTerm || cultivoNombre.toLowerCase().includes(searchCultivoTerm.toLowerCase())
      return cumpleEstado && cumpleBusqueda
    })

    return filtered.sort((a, b) => {
      const fechaA = new Date(a.fechaInicio || a.fecha_inicio || a.fechainicio || '')
      const fechaB = new Date(b.fechaInicio || b.fecha_inicio || b.fechainicio || '')
      return fechaA - fechaB
    })
  }, [cultivos, filtroEstadoCultivo, searchCultivoTerm])

  const cultivosById = useMemo(
    () => Object.fromEntries(cultivosData.map((cultivo) => [Number(cultivo.id), cultivo])),
    [cultivosData]
  )

  const activeUsuarioAssignments = useMemo(() => {
    if (!activeUsuario) return []

    const rowsMap = new Map()

    ;(activeUsuario.cultivos || []).forEach((cultivoId) => {
      const numCultivoId = Number(cultivoId)
      const cultivo = cultivosById[numCultivoId]
      if (!cultivo) return

      const numFincaId = Number(cultivo.idfinca)
      const fincaName = fincasById[numFincaId]?.nombre || 'Finca desconocida'

      const existing = rowsMap.get(numFincaId) || {
        finca: fincaName,
        cultivos: [],
      }
      existing.cultivos.push(cultivo.nombre)
      rowsMap.set(numFincaId, existing)
    })

    ;(activeUsuario.fincas || []).forEach((fincaId) => {
      const numFincaId = Number(fincaId)
      if (!rowsMap.has(numFincaId)) {
        rowsMap.set(numFincaId, {
          finca: fincasById[numFincaId]?.nombre || 'Finca desconocida',
          cultivos: [],
        })
      }
    })

    return Array.from(rowsMap.values()).map((entry) => ({
      finca: entry.finca,
      cultivos: entry.cultivos.length > 0 ? entry.cultivos.join(', ') : 'Sin cultivos asignados',
    }))
  }, [activeUsuario, fincasById, cultivosById])

  // Abre un modal dinámico de creación dependiendo del tipo seleccionado.
  const handleOpenDynamicModal = async (type) => {
    // Clear any previous editing state to avoid stale initial data
    setEditingUser(null)
    setEditingFinca(null)
    setEditingCultivo(null)
    setEditingCosto(null)
    setModalInitialData(undefined)
    setDynamicModalType(type)

    if (type === MODAL_TYPES.USUARIO) {
      setModalFieldOptions({ fincas: [], cultivos: [] })

      const loadOptions = async () => {
        try {
          const [fincasResponse, cultivosResponse] = await Promise.all([
            fetchFincas(),
            fetchCultivosEnProceso(),
          ])

          const fincasArray = fincasResponse?.success
            ? fincasResponse.data
            : Array.isArray(fincasResponse)
            ? fincasResponse
            : fincasResponse?.data || []

          const cultivosArray = cultivosResponse?.success
            ? cultivosResponse.data
            : Array.isArray(cultivosResponse)
            ? cultivosResponse
            : cultivosResponse?.data || []

          const fincasOptions = fincasArray.map((finca) => ({ value: finca.id, label: finca.nombre }))
          const cultivosOptions = cultivosArray.map((cultivo) => ({
            value: cultivo.id,
            label: cultivo.nombre,
            description: `Finca: ${cultivo.finca_nombre || 'No asignada'}`,
          }))

          setModalFieldOptions({ fincas: fincasOptions, cultivos: cultivosOptions })

          if (!fincasResponse?.success && !Array.isArray(fincasResponse)) {
            showNotification('No se pudieron cargar las fincas', 'error')
          }
          if (!cultivosResponse?.success && !Array.isArray(cultivosResponse)) {
            showNotification('No se pudieron cargar los cultivos', 'error')
          }
        } catch (error) {
          console.error('Error cargando opciones de usuario:', error)
          showNotification('Error cargando fincas y cultivos', 'error')
        }
      }

      ;(async () => {
        await loadOptions()
        setShowDynamicModal(true)
      })()
    }

    if (type === MODAL_TYPES.CULTIVO) {
      setModalFieldOptions({ tipo: [] })

      const loadTipos = async () => {
        try {
          const tiposResponse = await fetchTiposCultivo()
          const tiposArray = tiposResponse?.success
            ? tiposResponse.data
            : Array.isArray(tiposResponse)
            ? tiposResponse
            : tiposResponse?.data || []

          setModalFieldOptions({
            tipo: tiposArray.map((tipo) => ({ value: tipo.id, label: tipo.nombre })),
          })

          if (!tiposArray || tiposArray.length === 0) {
            console.warn('No tipos de cultivo cargados')
          }
        } catch (error) {
          console.error('Error cargando tipos de cultivo:', error)
          showNotification('Error cargando tipos de cultivo', 'error')
        }
      }

      ;(async () => {
        await loadTipos()
        // Siempre abrir el modal después de intentar cargar tipos
        setShowDynamicModal(true)
      })()
    }

    if (type !== MODAL_TYPES.USUARIO && type !== MODAL_TYPES.CULTIVO && type !== MODAL_TYPES.COSTO) setShowDynamicModal(true)

    if (type === MODAL_TYPES.COSTO) {
      setEditingCosto(null)
      const isGeneralCostSection = activeSection === 'costos'

      if (!selectedCultivoId && !isGeneralCostSection) {
        await Swal.fire({
          title: 'AgroGestion',
          text: 'Debes seleccionar un cultivo primero para poder registrar el costo.',
          icon: 'warning',
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#ffffff',
          customClass: {
            confirmButton: 'custom-confirm-btn',
          },
        })
        return
      }

      if (!isGeneralCostSection && selectedCultivoId) {
        // Validar que el cultivo puede agregar costos
        const validateCultivo = async () => {
          try {
            const validation = await validateCultivoForCost(selectedCultivoId)
            if (!validation.valid) {
              if (validation.reason === 'no_active_etapa_en_proceso' || validation.reason === 'no_etapa_en_proceso') {
                await Swal.fire({
                  title: 'AgroGestion',
                  text: 'No puede registrar el costo porque el cultivo no tiene una etapa activa en proceso',
                  icon: 'warning',
                  confirmButtonText: 'Aceptar',
                  confirmButtonColor: '#dc3545',
                  cancelButtonColor: '#ffffff',
                  customClass: {
                    confirmButton: 'custom-confirm-btn',
                  },
                })
                return
              }

              let errorMsg = 'No es posible agregar el costo'
              if (validation.reason === 'no_etapas') {
                errorMsg += ' debido a que el cultivo actualmente no tiene etapas registradas'
              } else if (validation.reason === 'cultivo_not_in_process') {
                errorMsg += ' debido a que el cultivo no está en proceso'
              }

              await Swal.fire({
                title: 'AgroGestion',
                text: errorMsg,
                icon: 'warning',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#ffffff',
                customClass: {
                  confirmButton: 'custom-confirm-btn',
                },
              })
              return
            }

            let categoriasArray = costoCategoriaOptions
            if (!categoriasArray.length) {
              const categoriasResponse = await fetchCategoriasCosto()
              categoriasArray = Array.isArray(categoriasResponse)
                ? categoriasResponse
                : categoriasResponse?.data || []
            }

            let estadosPagoArray = costoEstadoPagoOptions
            if (!estadosPagoArray.length) {
              const estadosPagoResponse = await fetchEstadosPago()
              estadosPagoArray = Array.isArray(estadosPagoResponse)
                ? estadosPagoResponse
                : estadosPagoResponse?.data || []
            }

            setModalFieldOptions({
              categoria: categoriasArray.map((cat) => ({ value: cat.id, label: cat.nombre })),
              estado_pago: estadosPagoArray.map((estado) => ({ value: estado.id, label: estado.nombre })),
              subcategoria: [],
            })

            setModalInitialData({})
            setShowDynamicModal(true)
          } catch (error) {
            console.error('Error validando cultivo para agregar costo:', error)
            showNotification('Error al validar el cultivo', 'error')
          }
        }

        validateCultivo()
      } else {
        try {
          let categoriasArray = costoCategoriaOptions
          if (!categoriasArray.length) {
            const categoriasResponse = await fetchCategoriasCosto()
            categoriasArray = Array.isArray(categoriasResponse)
              ? categoriasResponse
              : categoriasResponse?.data || []
          }

          let estadosPagoArray = costoEstadoPagoOptions
          if (!estadosPagoArray.length) {
            const estadosPagoResponse = await fetchEstadosPago()
            estadosPagoArray = Array.isArray(estadosPagoResponse)
              ? estadosPagoResponse
              : estadosPagoResponse?.data || []
          }

          setModalFieldOptions({
            categoria: categoriasArray.map((cat) => ({ value: cat.id, label: cat.nombre })),
            estado_pago: estadosPagoArray.map((estado) => ({ value: estado.id, label: estado.nombre })),
            subcategoria: [],
          })

          setModalInitialData({})
          setShowDynamicModal(true)
        } catch (error) {
          console.error('Error preparando modal de costo general:', error)
          showNotification('Error al preparar el costo', 'error')
        }
      }
    }
  }

  const handleCostoFieldChange = useCallback(
    async (name, value) => {
      if (name === 'categoria') {
        try {
          const subcategoriasResponse = await fetchSubcategoriasPorCategoria(value)
          const subcategoriasArray = Array.isArray(subcategoriasResponse) ? subcategoriasResponse : subcategoriasResponse?.data || []
          setModalFieldOptions((prev) => ({
            ...prev,
            subcategoria: subcategoriasArray.map((subcat) => ({ value: subcat.id, label: subcat.nombre })),
          }))
        } catch (error) {
          console.error('Error cargando subcategorías:', error)
          showNotification('Error al cargar subcategorías', 'error')
        }
      }
    },
    [showNotification]
  )

  const handleOpenEditCosto = async (costo) => {
    setEditingUser(null)
    setEditingFinca(null)
    setEditingCultivo(null)
    setEditingCosto(costo)
    setDynamicModalType(MODAL_TYPES.COSTO)

    try {
      let categoriasArray = costoCategoriaOptions
      if (!categoriasArray.length) {
        const categoriasResponse = await fetchCategoriasCosto()
        categoriasArray = Array.isArray(categoriasResponse) ? categoriasResponse : categoriasResponse?.data || []
      }

      let estadosPagoArray = costoEstadoPagoOptions
      if (!estadosPagoArray.length) {
        const estadosPagoResponse = await fetchEstadosPago()
        estadosPagoArray = Array.isArray(estadosPagoResponse) ? estadosPagoResponse : estadosPagoResponse?.data || []
      }

      const categoriaId = costo.categoriaId || null
      let subcategoriasArray = []
      if (categoriaId) {
        const subcategoriasResponse = await fetchSubcategoriasPorCategoria(categoriaId)
        subcategoriasArray = Array.isArray(subcategoriasResponse) ? subcategoriasResponse : subcategoriasResponse?.data || []
      }

      setModalFieldOptions({
        categoria: categoriasArray.map((cat) => ({ value: cat.id, label: cat.nombre })),
        estado_pago: estadosPagoArray.map((estado) => ({ value: estado.id, label: estado.nombre })),
        subcategoria: subcategoriasArray.map((subcat) => ({ value: subcat.id, label: subcat.nombre })),
      })

      setModalInitialData({
        categoria: costo.categoriaId || '',
        subcategoria: costo.subcategoriaId || '',
        descripcion: costo.descripcion || '',
        valor: normalizeNumericInputValue(costo.valor) || '',
        estado_pago: costo.estadoPagoId || '',
      })
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error abriendo modal de edición de costo:', error)
      showNotification('Error al preparar la edición del costo', 'error')
    }
  }

  const handleDeleteCosto = async (costo) => {
    playWarning()
    const confirmed = await Swal.fire({
      title: 'Costo 🚫',
      text: `Este costo dejará de participar en los análisis y reportes económicos del sistema.\n\nSi el registro contiene información incorrecta, puede editarlo en lugar de anularlo.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Anular Costo',
      question: 'Indica el motivo por el cual se anula el costo',
      callback: async (motivo) => {
        try {
          const res = await changeCostoState(costo.id, 'ANULADO', motivo)
          if (!res || !res.success) {
            showNotification(res?.message || 'No se pudo anular el costo', 'error')
            playError()
            return
          }
          await refreshCultivoDetalleData()
          setFincasRefresh((prev) => prev + 1)
          if (activeSection === 'costos' && fincaId) {
            try {
              const data = await fetchCostosPorFinca(Number(fincaId))
              setCostosGenerales(Array.isArray(data) ? data : [])
            } catch (error) {
              console.error('Error recargar costos generales:', error)
            }
          }
          showNotification('Costo anulado correctamente', 'success')
        } catch (error) {
          console.error('Error anular costo:', error)
          const errMsg = error?.response?.data?.message || 'Error al anular el costo'
          showNotification(errMsg, 'error')
          playError()
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  const handleOpenAgregarCosecha = async () => {
    if (!selectedCultivoId) {
      await Swal.fire({
        title: 'AgroGestion',
        text: 'Selecciona un cultivo primero.',
        icon: 'warning',
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#dc3545',
      })
      return
    }

    try {
      const etapas = await fetchEtapasPorCultivo(selectedCultivoId)
      const hasCosechaActiva = Array.isArray(etapas)
        ? etapas.some(
            (etapa) =>
              String(etapa.nombre || etapa.nombre_etapa || '').trim().toLowerCase() === 'cosecha' &&
              String(etapa.estado || etapa.nombre_estado || '').trim().toLowerCase() === 'en proceso' &&
              (etapa.activo === true || String(etapa.activo).toLowerCase() === 'true')
          )
        : false

      if (!hasCosechaActiva) {
        await Swal.fire({
          title: 'AgroGestion',
          text: 'No puedes agregar cosechas a este cultivo porque no tiene una etapa de cosecha activa en proceso.',
          icon: 'warning',
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#dc3545',
        })
        return
      }

      const unidadesResponse = cosechaUnidadOptions.length ? cosechaUnidadOptions : await fetchUnidadesMedida()
      const unidadesArray = Array.isArray(unidadesResponse) ? unidadesResponse : unidadesResponse?.data || []
      const tiposPrecioResponse = cosechaTipoPrecioOptions.length ? cosechaTipoPrecioOptions : await fetchTiposPrecio()
      const tiposPrecioArray = Array.isArray(tiposPrecioResponse) ? tiposPrecioResponse : tiposPrecioResponse?.data || []

      setModalFieldOptions({
        unidad_medida: unidadesArray.map((unidad) => ({ value: unidad.id, label: unidad.nombre })),
        tipo_precio: tiposPrecioArray.map((tipo) => ({ value: tipo.id, label: tipo.nombre })),
      })
      setEditingCosecha(null)
      setModalInitialData({ cantidad: '', unidad_medida: '', precio: '', tipo_precio: '' })
      setDynamicModalType(MODAL_TYPES.COSECHA)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando el modal de cosecha:', error)
      showNotification('Error al preparar el modal de cosecha', 'error')
    }
  }

  const handleOpenEditCosecha = async (cosecha) => {
    try {
      const unidadesResponse = cosechaUnidadOptions.length ? cosechaUnidadOptions : await fetchUnidadesMedida()
      const unidadesArray = Array.isArray(unidadesResponse) ? unidadesResponse : unidadesResponse?.data || []
      const tiposPrecioResponse = cosechaTipoPrecioOptions.length ? cosechaTipoPrecioOptions : await fetchTiposPrecio()
      const tiposPrecioArray = Array.isArray(tiposPrecioResponse) ? tiposPrecioResponse : tiposPrecioResponse?.data || []

      setModalFieldOptions({
        unidad_medida: unidadesArray.map((unidad) => ({ value: unidad.id, label: unidad.nombre })),
        tipo_precio: tiposPrecioArray.map((tipo) => ({ value: tipo.id, label: tipo.nombre })),
      })

      const cosechaData = normalizeCosecha(cosecha)
      setEditingCosecha(cosechaData)
      setModalInitialData({
        cantidad: formatPrecioValue(cosechaData.cantidad),
        unidad_medida: normalizeSelectValue(cosechaData.unidad_medida),
        precio: normalizeNumericInputValue(cosechaData.precio),
        tipo_precio: normalizeSelectValue(cosechaData.tipo_precio),
      })
      setDynamicModalType(MODAL_TYPES.COSECHA)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando la edición de cosecha:', error)
      showNotification('Error al preparar la edición de cosecha', 'error')
    }
  }

  const handleDeleteCosecha = async (cosecha) => {
    playWarning()
    const confirmed = await Swal.fire({
      title: 'Cosecha 🚫',
      text: `Esta cosecha dejará de participar en los análisis de producción e ingresos.\n\nSi el registro contiene errores, puede editarla en lugar de anularla.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Anular Cosecha',
      question: 'Indica el motivo por el cual se anula la cosecha',
      callback: async (motivo) => {
        try {
          const res = await changeCosechaState(cosecha.id, 'ANULADO', motivo)
          if (!res || !res.success) {
            showNotification(res?.message || 'No se pudo anular la cosecha', 'error')
            playError()
            return
          }
          await refreshCultivoDetalleData()
          setFincasRefresh((prev) => prev + 1)
          showNotification('Cosecha anulada correctamente', 'success')
        } catch (error) {
          console.error('Error anulando cosecha:', error)
          const message = error?.response?.data?.message || error?.message || 'Error anulando cosecha'
          showNotification(message, 'error')
          playError()
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  // for other types, open modal immediately

  // Abre el modal para editar un usuario existente sin diálogo extra.
  const handleOpenEditUser = (usuario) => {
    // Clear other editors and reset modal data to ensure fresh state
    setEditingFinca(null)
    setEditingCultivo(null)
    setModalInitialData(undefined)
    setEditingUser(usuario)
    setDynamicModalType(MODAL_TYPES.USUARIO)

    const loadOptions = async () => {
      try {
        const [fincasResponse, cultivosResponse] = await Promise.all([
          fetchFincas(),
          fetchCultivosEnProceso(),
        ])

        const fincasArray = fincasResponse?.success
          ? fincasResponse.data
          : Array.isArray(fincasResponse)
          ? fincasResponse
          : fincasResponse?.data || []

        const cultivosArray = cultivosResponse?.success
          ? cultivosResponse.data
          : Array.isArray(cultivosResponse)
          ? cultivosResponse
          : cultivosResponse?.data || []

        const fincasOptions = fincasArray.map((finca) => ({ value: finca.id, label: finca.nombre }))
        const cultivosOptions = cultivosArray.map((cultivo) => ({
          value: cultivo.id,
          label: `${cultivo.nombre} (${cultivo.finca_nombre || 'No asignada'})`,
          description: `Finca: ${cultivo.finca_nombre || 'No asignada'}`,
        }))

        setModalFieldOptions({ fincas: fincasOptions, cultivos: cultivosOptions })

        if (!fincasResponse?.success && !Array.isArray(fincasResponse)) {
          showNotification('No se pudieron cargar las fincas', 'error')
        }
        if (!cultivosResponse?.success && !Array.isArray(cultivosResponse)) {
          showNotification('No se pudieron cargar los cultivos', 'error')
        }
      } catch (error) {
        console.error('Error cargando opciones de edición de usuario:', error)
        showNotification('Error cargando fincas y cultivos', 'error')
      }
    }

    ;(async () => {
      await loadOptions()
      setShowDynamicModal(true)
    })()
  }

  // Cierra el modal dinámico y limpia el estado asociado.
  const handleCloseDynamicModal = () => {
    setShowDynamicModal(false)
    setDynamicModalType(null)
    setEditingUser(null)
    setModalInitialData(undefined)
    setModalFieldOptions({})
    setEditingCultivo(null)
    setEditingEtapa(null)
    setEditingCosto(null)
    setEditingCosecha(null)
  }

  // Elimina un usuario después de pedir confirmación.
  const handleDeleteUser = async (id) => {
    playWarning()
    const confirmed = await Swal.fire({
      title: 'Usuario 🔒',
      text: `Este usuario perderá el acceso al sistema y no podrá iniciar sesión.\n\nSu información e historial permanecerán disponibles.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Desactivar Usuario',
      question: 'Indica el motivo por el cual se desactiva el usuario',
      callback: async (motivo) => {
        try {
          const response = await changeUserState(id, 'DESACTIVADO', motivo)
          if (!response || !response.success) {
            showNotification(response?.message || 'No se pudo desactivar el usuario', 'error')
            playError()
            return
          }
          // Recargar lista de usuarios desde API
          try {
            const usersData = await fetchUsers()
            setUsers(Array.isArray(usersData) ? usersData : [])
          } catch (error) {
            console.error('Error recargar usuarios:', error)
          }
          if (activeUsuarioId === id) {
            setActiveUsuarioId(null)
            setAsignacionesOpen(false)
          }
          showNotification('Usuario desactivado correctamente', 'success')
        } catch (error) {
          console.error(error)
          showNotification(error?.response?.data?.message || 'Error desactivando el usuario', 'error')
          playError()
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  // Elimina un cultivo después de pedir confirmación.
  const handleDeleteCultivo = async (id) => {
    playWarning()
    const confirmed = await Swal.fire({
      title: 'Cultivo 📂',
      text: `Este cultivo dejará de estar disponible para nuevas operaciones y pasará al historial.\n\nSi solo necesita corregir información, puede editar el cultivo sin archivarlo.\n\n¿Desea continuar?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, archivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!confirmed.isConfirmed) return

    setReasonModal({
      isOpen: true,
      title: 'Archivar Cultivo',
      question: 'Indica el motivo por el cual se archiva el cultivo',
      callback: async (motivo) => {
        try {
          const res = await changeCultivoState(id, 'ARCHIVADO', motivo)
          if (!res || !res.success) {
            showNotification(res?.message || 'No se pudo archivar el cultivo', 'error')
            playError()
            return
          }
          // Recargar cultivos filtrados por estado actual y refrescar el dashboard.
          await fetchCultivosData(fincaId)
          setFincasRefresh((prev) => prev + 1)
          if (reportVisible && reportType) {
            await fetchReport(reportType)
          }
          showNotification('Cultivo archivado correctamente', 'success')
        } catch (error) {
          console.error(error)
          showNotification(error?.response?.data?.message || 'Error archivando el cultivo', 'error')
          playError()
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }
   

  // Envía los datos del modal dinámico según el tipo seleccionado.
  const handleSubmitDynamicModal = async (formData) => {
    const normalizedFormData = normalizeModalTextFields(formData)
    let successMessage = ''

    switch (dynamicModalType) {
      case MODAL_TYPES.USUARIO: {
        // Formatea nombres y apellidos a mayúsculas en inicial.
        const formatWords = (value) =>
          value
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')

        const payload = {
          nombre: normalizedFormData.nombre || '',
          apellidos: normalizedFormData.apellidos || '',
          correo: normalizedFormData.correo || '',
          contraseña: normalizedFormData.contraseña,
          rol: normalizedFormData.rol || '',
          fincas: Array.isArray(normalizedFormData.fincas) ? normalizedFormData.fincas.map(Number).filter(Boolean) : [],
          cultivos: Array.isArray(normalizedFormData.cultivos) ? normalizedFormData.cultivos.map(Number).filter(Boolean) : [],
        }

        if (editingUser) {
          // Actualiza usuario existente.
          const response = await updateUser(editingUser.id, payload)
          if (!response.success) {
            showNotification(response.message, 'error')
            playError()
            return
          }

          setUsers((prev) => prev.map((usuario) => (usuario.id === response.data.id ? response.data : usuario)))
          successMessage = `Usuario "${response.data.nombre} ${response.data.apellidos}" actualizado exitosamente`
        } else {
          // Crea un nuevo usuario.
          const response = await createUser(payload)
          if (!response.success) {
            showNotification(response.message, 'error')
            playError()
            return
          }

          setUsers((prev) => [...prev, response.data])
          successMessage = `Usuario "${response.data.nombre} ${response.data.apellidos}" agregado exitosamente`
        }
        break
      }
      case MODAL_TYPES.CULTIVO: {
        const nombre = normalizedFormData.nombre?.trim() || ''
        const idtipocultivo = Number(normalizedFormData.tipo)
        const idfinca = Number(fincaId)
        const idestado = editingCultivo && normalizedFormData.estado ? Number(normalizedFormData.estado) : null
        const fechaInicio = normalizedFormData.fechaInicio || null

        // Para crear: nombre y tipo son suficientes. Para editar: también requiere estado
        if (!nombre || !idtipocultivo) {
          showNotification('Por favor completa el nombre y tipo del cultivo', 'error')
          playError()
          return
        }

        if (!idfinca || idfinca <= 0) {
          showNotification('Debe seleccionar una finca antes de agregar un cultivo', 'error')
          playError()
          return
        }

        if (editingCultivo && !idestado) {
          showNotification('Por favor selecciona un estado para actualizar el cultivo', 'error')
          playError()
          return
        }

        try {
          if (editingCultivo) {
            // Actualizar cultivo existente
            const resp = await updateCultivo(editingCultivo.id, {
              nombre,
              idtipocultivo,
              idestado,
              fecha_inicio: fechaInicio,
            })

            if (!resp || resp.success === false) {
              const msg = resp?.message || 'Error actualizando el cultivo'
              showNotification(msg, 'error')
              playError()
              return
            }

            successMessage = `Cultivo "${nombre}" actualizado exitosamente`
            setEditingCultivo(null)
          } else {
            // Crear nuevo cultivo
            console.log('[admin-panel] Creating cultivo', { nombre, idtipocultivo, idfinca })
            const resp = await createCultivo({ nombre, idtipocultivo, idfinca })
            console.log('[admin-panel] createCultivo response', resp)
            if (!resp || resp.success === false) {
              const msg = resp?.message || 'Error creando el cultivo'
              showNotification(msg, 'error')
              playError()
              return
            }
            successMessage = `Cultivo "${nombre}" agregado exitosamente`
          }

          // Recargar cultivos de la finca actual y actualizar el conteo de cultivos activos.
          await fetchCultivosData(String(idfinca))
          setFincasRefresh((prev) => prev + 1)
          const cultivosResponse = await fetchCultivosEnProceso()
          const cultivosArray = cultivosResponse?.success
            ? cultivosResponse.data
            : Array.isArray(cultivosResponse)
            ? cultivosResponse
            : cultivosResponse?.data || []

          setCultivosData(cultivosArray)
          if (reportVisible && reportType) {
            await fetchReport(reportType)
          }
        } catch (error) {
          console.error('Error guardando/actualizando cultivo:', error)
          const message = error?.response?.data?.message || error?.response?.data?.error || 'Error guardando el cultivo'
          showNotification(message, 'error')
          return
        }
        break
      }
      case MODAL_TYPES.COSTO: {
        const descripcion = normalizedFormData.descripcion?.trim() || null
        const valor = parseMoneyValue(normalizedFormData.valor)
        const idsubcategoria = Number(normalizedFormData.subcategoria)
        const idestado_pago = Number(normalizedFormData.estado_pago)
        const isGeneralCostSection = activeSection === 'costos'

        if (!idsubcategoria || isNaN(idsubcategoria)) {
          showNotification('Selecciona una subcategoría válida para el costo', 'error')
          playError()
          return
        }

        if (!idestado_pago || isNaN(idestado_pago)) {
          showNotification('Selecciona un estado de pago válido', 'error')
          playError()
          return
        }

        if (Number.isNaN(valor) || valor <= 0 || valor > 100000000000) {
          showNotification('El valor debe ser un monto COP válido mayor a 0', 'error')
          playError()
          return
        }

        if (!session?.id) {
          showNotification('No se pudo determinar el usuario en sesión', 'error')
          playError()
          return
        }

        try {
          if (editingCosto) {
            const response = await updateCosto(editingCosto.id, {
              descripcion,
              valor,
              idsubcategoria,
              idestado_pago,
            })

            if (!response || response.success === false) {
              const errorText = response?.message || 'No fue posible actualizar el costo'
              showNotification(errorText, 'error')
              return
            }

            successMessage = 'Costo actualizado exitosamente'
            setEditingCosto(null)
            setFincasRefresh((prev) => prev + 1)
          } else if (isGeneralCostSection) {
            if (!fincaId) {
              showNotification('Selecciona una finca para registrar el costo', 'error')
              return
            }

            const respuesta = await createCosto({
              descripcion,
              valor,
              idcultivo: null,
              idetapa_cultivo: null,
              idusuario: Number(session.id),
              idsubcategoria,
              idfinca: Number(fincaId),
              idestado_pago,
            })

            if (!respuesta || respuesta.success === false) {
              const errorText = respuesta?.message || 'No fue posible crear el costo'
              showNotification(errorText, 'error')
              return
            }

            successMessage = 'Costo agregado exitosamente'
            setFincasRefresh((prev) => prev + 1)
          } else {
            if (!selectedCultivoId) {
              showNotification('Debes seleccionar un cultivo primero', 'error')
              return
            }

            const cultivo = cultivos.find((c) => c.id === selectedCultivoId)
            if (!cultivo) {
              showNotification('El cultivo seleccionado no se encontró', 'error')
              return
            }

            const etapaEnProceso = await fetchEtapaEnProcesoPorCultivo(selectedCultivoId)
            const etapaId = etapaEnProceso?.idetapacultivo ? Number(etapaEnProceso.idetapacultivo) : null

            if (!etapaId) {
              await Swal.fire({
                title: 'AgroGestion',
                text: 'No puede registrar el costo porque el cultivo no tiene una etapa activa en proceso',
                icon: 'warning',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#ffffff',
                customClass: {
                  confirmButton: 'custom-confirm-btn',
                },
              })
              return
            }

            const respuesta = await createCosto({
              descripcion,
              valor,
              idcultivo: selectedCultivoId,
              idetapa_cultivo: etapaId,
              idusuario: Number(session.id),
              idsubcategoria,
              idfinca: Number(cultivo.idfinca),
              idestado_pago,
            })

            if (!respuesta || respuesta.success === false) {
              const errorText = respuesta?.message || 'No fue posible crear el costo'
              showNotification(errorText, 'error')
              return
            }

            successMessage = 'Costo agregado exitosamente'
            setFincasRefresh((prev) => prev + 1)
          }

          if (activeSection === 'costos') {
            const costos = await fetchCostosPorFinca(Number(fincaId))
            setCostosGenerales(Array.isArray(costos) ? costos : [])
          } else {
            const detalle = await fetchCultivoDetalle(selectedCultivoId)
            setDetalleCostos(Array.isArray(detalle) ? detalle : [])
          }

          await refreshCultivoDetalleData()
        } catch (error) {
          console.error('Error guardando costo:', error)
          const errMsg = error?.response?.data?.message || 'Error al guardar el costo'
          showNotification(errMsg, 'error')
          return
        }
        break
      }
      case MODAL_TYPES.COSECHA: {
        const cantidad = parseMoneyValue(normalizedFormData.cantidad)
        const idunidadmedida = Number(normalizedFormData.unidad_medida)
        const precio = parseMoneyValue(normalizedFormData.precio)
        const idtipo_precio = Number(normalizedFormData.tipo_precio)

        if (!Number.isFinite(cantidad) || cantidad < 0) {
          showNotification('La cantidad debe ser un número válido mayor o igual a 0', 'error')

          playError()
          return
        }

        if (!idunidadmedida || Number.isNaN(idunidadmedida)) {
          showNotification('Selecciona una unidad de medida válida', 'error')

          playError()
          return
        }

        if (!Number.isFinite(precio) || precio < 0) {
          showNotification('El precio debe ser un número válido mayor o igual a 0', 'error')

          playError()
          return
        }

        if (!idtipo_precio || Number.isNaN(idtipo_precio)) {
          showNotification('Selecciona un tipo de precio válido', 'error')

          playError()
          return
        }

        if (!selectedCultivoId) {
          showNotification('Selecciona un cultivo primero', 'error')

          playError()
          return
        }

        try {
          if (editingCosecha) {
            const response = await updateCosecha(editingCosecha.id, {
              cantidad,
              idunidadmedida,
              precio,
              idtipo_precio,
            })

            if (!response || response.success === false) {
              const errorText = response?.message || 'No fue posible actualizar la cosecha'
              showNotification(errorText, 'error')
              return
            }

            successMessage = 'Cosecha actualizada exitosamente'
            setEditingCosecha(null)
            setFincasRefresh((prev) => prev + 1)
          } else {
            const response = await createCosecha(selectedCultivoId, {
              cantidad,
              idunidadmedida,
              precio,
              idtipo_precio,
            })

            if (!response || response.success === false) {
              const errorText = response?.message || 'No fue posible crear la cosecha'
              showNotification(errorText, 'error')
              return
            }

            successMessage = 'Cosecha agregada exitosamente'
            setFincasRefresh((prev) => prev + 1)
          }

          const detalle = await fetchCosechasPorCultivo(selectedCultivoId)
          setDetalleCosechas(Array.isArray(detalle) ? detalle.map(normalizeCosecha) : [])
          await refreshCultivoDetalleData()
        } catch (error) {
          console.error('Error guardando cosecha:', error)
          const errMsg = error?.response?.data?.message || 'Error al guardar la cosecha'
          showNotification(errMsg, 'error')
          return
        }
        break
      }
      case MODAL_TYPES.FINCA: {
        const nombre = normalizedFormData.nombre?.trim() || ''
        const departamento = normalizedFormData.departamento
        const municipio = normalizedFormData.municipio
        if (!nombre || !departamento || !municipio) {
          showNotification('Por favor completa todos los campos de la finca', 'error')

          playError()
          return
        }
        const ubicacion = `${municipio}, ${departamento}`
        try {
          if (editingFinca) {
            await updateFinca(editingFinca.id, { nombre, ubicacion })
            successMessage = `Finca "${nombre}" actualizada exitosamente`
          } else {
            await createFinca({ nombre, ubicacion })
            successMessage = `Finca "${nombre}" agregada exitosamente`
          }
          setFincasRefresh((prev) => prev + 1)
          setEditingFinca(null)
        } catch (error) {
          console.error(error)
          const message = error?.response?.data?.error || 'Error guardando la finca'
          showNotification(message, 'error')
          return
        }
        break
      }
      case MODAL_TYPES.ETAPA: {
          // Si estamos editando, delegar a handleSubmitEditEtapa, si no, a handleSubmitAddEtapa
          if (editingEtapa) {
            await handleSubmitEditEtapa(formData)
          } else {
            await handleSubmitAddEtapa(formData)
          }
          // avoid falling through to default success message
          return
        }
      default:
        successMessage = 'Datos agregados exitosamente'
    }

    showNotification(successMessage, 'success')
    handleCloseDynamicModal()
    return true
  }

  const resumen = dashboardData?.summary || {
    costos: 0,
    ingresos: 0,
    ganancia: 0,
    produccionKg: 0,
    cultivosActivos: 0,
    cultivosFinalizados: 0,
  }

  // Ajuste: el dashboard debe operar únicamente con registros con estado_registro = 'ACTIVO'.
  // El backend ya devuelve un resumen filtrado por activos; usamos ese resumen directo.
  const dashboardRentabilidadRowsActivos = dashboardData?.rentability?.filter((row) => {
    const raw = row.estado_registro ?? row.estadoRegistro ?? row.estado ?? row.activo
    if (raw == null) return true
    const s = String(raw).trim().toUpperCase()
    if (s === '1' || s === 'TRUE' || s === 'T' || s === 'ACTIVO') return true
    if (s === '0' || s === 'FALSE' || s === 'F' || s === 'ANULADO') return false
    return s === 'ACTIVO'
  }) || []

  const dashboardResumenActivos = useMemo(() => resumen, [resumen])

  const dashboardResumen = dashboardResumenActivos
  const margin = dashboardResumen.ingresos > 0 ? (dashboardResumen.ganancia / dashboardResumen.ingresos) * 100 : 0

  // Estandariza y filtra las series del dashboard para que TODO (tarjetas y gráficas)
  // trabaje únicamente con registros con estado_registro = 'ACTIVO'.
  // updateAdminDashboardCharts usa: productionTrend, costTrend, costByCategory y rentability.
  const dashboardDataActivos = useMemo(() => {
    if (!dashboardData) return null

    const normalizeEstadoRegistro = (raw) => {
      if (raw == null) return null
      const s = String(raw).trim().toUpperCase()
      if (s === '1' || s === 'TRUE' || s === 'T' || s === 'ACTIVO') return 'ACTIVO'
      if (s === '0' || s === 'FALSE' || s === 'F' || s === 'ANULADO') return 'ANULADO'
      // si viene ya como ACTIVO/ANULADO (o similar)
      if (s === 'ACTIVO' || s === 'ANULADO') return s
      return s
    }

    const rentabilityActivos = (dashboardData?.rentability || []).filter((row) => {
      const raw = row.estado_registro ?? row.estadoRegistro ?? row.activo
      if (raw == null) return true
      return normalizeEstadoRegistro(raw) === 'ACTIVO'
    })

    // costTrend/productionTrend/costByCategory no traen estado_registro explícito en el chart.js,
    // así que filtramos si vienen con estado_registro o estado.
    const filterTrendActivos = (arr) => {
      if (!Array.isArray(arr)) return []
      return arr.filter((item) => {
        const raw = item.estado_registro ?? item.estadoRegistro ?? item.estado ?? item.activo
        // si no hay estado, no se elimina (fallback)
        const norm = normalizeEstadoRegistro(raw)
        return norm == null ? true : norm === 'ACTIVO'
      })
    }

    const costByCategoryActivos = (dashboardData?.costByCategory || dashboardData?.costByCategories || []).filter((item) => {
      const raw = item.estado_registro ?? item.estadoRegistro ?? item.estado ?? item.activo
      const norm = normalizeEstadoRegistro(raw)
      return norm == null ? true : norm === 'ACTIVO'
    })

    return {
      ...dashboardData,
      rentability: rentabilityActivos,
      productionTrend: filterTrendActivos(dashboardData?.productionTrend),
      costTrend: filterTrendActivos(dashboardData?.costTrend),
      costByCategory: costByCategoryActivos,
    }
  }, [dashboardData])

  const formatTrendChange = (trend = []) => {
    if (!Array.isArray(trend) || trend.length < 2) return 'Sin datos históricos'
    const previous = trend[trend.length - 2]?.value || 0
    const current = trend[trend.length - 1]?.value || 0
    if (previous === 0) {
      return current === 0 ? 'Sin cambio reciente' : `Ultimo mes: +${Math.round(current)}%`
    }
    const diff = current - previous
    const percent = Math.round((diff / previous) * 100)
    const sign = diff >= 0 ? '+' : ''
    return `${sign}${percent}% desde el mes pasado`
  }

  const costTrendText = formatTrendChange(dashboardData?.costTrend)
  const productionTrendText = formatTrendChange(dashboardData?.productionTrend)
  const ingresosSubtext = dashboardData?.productionTrend?.length > 1 ? productionTrendText : 'Basado en ingresos registrados'

  const cultivosEnFinca = dashboardData?.cultivosEstado || []

  // Detalle completo del cultivo seleccionado (cuando se hace clic en uno).
  const detalleCultivo = selectedCultivoId ? Agro.getDetalleCultivo(selectedCultivoId) : null
  const cultivoSeleccionado = selectedCultivoId ? cultivos.find((c) => c.id === selectedCultivoId) : null
  const isSelectedCultivoActivo = cultivoSeleccionado?.estado_registro === 'ACTIVO'
  const [etapasCultivo, setEtapasCultivo] = useState([])
  const [isLoadingEtapas, setIsLoadingEtapas] = useState(false)
  // (replaced by DynamicModal usage)
  const [etapasCatalog, setEtapasCatalog] = useState([])
  const [isSavingEtapa, setIsSavingEtapa] = useState(false)
  const [searchEtapaInput, setSearchEtapaInput] = useState('')
  const [filterEtapaEstado, setFilterEtapaEstado] = useState('todos')
  const [editingEtapa, setEditingEtapa] = useState(null)
  const [etapaEstadoOptions, setEtapaEstadoOptions] = useState([])

  const sortEtapasForDisplay = (etapas = []) => {
    return [...etapas].sort((a, b) => {
      const dateA = new Date(a.fechaInicio || a.fecha_inicio || '')
      const dateB = new Date(b.fechaInicio || b.fecha_inicio || '')
      if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
        return dateA - dateB
      }
      if (a.id != null && b.id != null) {
        return a.id - b.id
      }
      return 0
    })
  }

  const etapasCultivoOrdenadas = useMemo(() => sortEtapasForDisplay(etapasCultivo), [etapasCultivo])

  // Suma los costos del cultivo seleccionado y cuenta los registros.
  const detallesCostosOrdenados = useMemo(() => {
    if (!detalleCostos || !detalleCostos.length) return []
    return [...detalleCostos].sort((a, b) => {
      const fechaA = new Date(a.fecha || '')
      const fechaB = new Date(b.fecha || '')
      if (!Number.isNaN(fechaA) && !Number.isNaN(fechaB)) return fechaA - fechaB
      if (a.id != null && b.id != null) return a.id - b.id
      return 0
    })
  }, [detalleCostos])

  const costoEtapaOptions = useMemo(() => {
    const uniqueEtapas = new Set()
    return etapasCultivo
      .map((etapa) => etapa.nombre)
      .filter(Boolean)
      .reduce((acc, etapaNombre) => {
        if (!uniqueEtapas.has(etapaNombre)) {
          uniqueEtapas.add(etapaNombre)
          acc.push({ value: etapaNombre, label: etapaNombre })
        }
        return acc
      }, [])
  }, [etapasCultivo])

  const getRegistroEstado = (item) => {
    if (!item || typeof item !== 'object') return null
    // accept multiple possible field names and types
    const raw = item.estado_registro ?? item.estadoRegistro ?? item.estado ?? (item.activo !== undefined ? (item.activo ? 'ACTIVO' : 'ANULADO') : null)
    if (raw == null) return null
    const s = String(raw).trim().toUpperCase()
    if (s === '1' || s === 'TRUE' || s === 'T') return 'ACTIVO'
    if (s === '0' || s === 'FALSE' || s === 'F') return 'ANULADO'
    if (s === 'ACTIVO' || s === 'ANULADO') return s
    return s
  }

  const visibleCostos = useMemo(() => {
    if (!detallesCostosOrdenados || !detallesCostosOrdenados.length) return []

    // Primero filtrar por estado_registro (ACTIVO / ANULADO) según el menú superior
    let filtered = [...detallesCostosOrdenados]
    if (detalleCostosEstado && detalleCostosEstado !== 'TODOS') {
      filtered = filtered.filter((costo) => {
        const reg = getRegistroEstado(costo)
        return String(reg || '').toUpperCase() === String(detalleCostosEstado).toUpperCase()
      })
    }

    if (costoFilterEtapa && costoFilterEtapa !== 'todos') {
      filtered = filtered.filter((costo) => String(costo.etapa || '').trim() === String(costoFilterEtapa).trim())
    }

    if (costoFilterCategoria && costoFilterCategoria !== 'todos') {
      filtered = filtered.filter((costo) => String(costo.categoria || '').trim() === String(costoFilterCategoria).trim())
    }

    if (costoFilterEstadoPago && costoFilterEstadoPago !== 'todos') {
      filtered = filtered.filter((costo) => String(costo.estado_pago || '').trim() === String(costoFilterEstadoPago).trim())
    }

    if (costoFilterFechaDesde) {
      const desde = new Date(costoFilterFechaDesde)
      if (!Number.isNaN(desde.getTime())) {
        filtered = filtered.filter((costo) => {
          const fecha = new Date(costo.fecha || '')
          return !Number.isNaN(fecha.getTime()) && fecha >= desde
        })
      }
    }

    if (costoFilterFechaHasta) {
      const hasta = new Date(costoFilterFechaHasta)
      if (!Number.isNaN(hasta.getTime())) {
        filtered = filtered.filter((costo) => {
          const fecha = new Date(costo.fecha || '')
          return !Number.isNaN(fecha.getTime()) && fecha <= hasta
        })
      }
    }

    return filtered
  }, [detallesCostosOrdenados, detalleCostosEstado, costoFilterEtapa, costoFilterCategoria, costoFilterEstadoPago, costoFilterFechaDesde, costoFilterFechaHasta])

  const costosDetalleTotales = useMemo(() => {
    if (!visibleCostos || !visibleCostos.length) return { total: 0, count: 0 }
    const total = visibleCostos.reduce((acc, f) => acc + (Number(f.valor) || 0), 0)
    return { total, count: visibleCostos.length }
  }, [visibleCostos])

  const costosGeneralesOrdenados = useMemo(() => {
    if (!costosGenerales || !costosGenerales.length) return []
    return [...costosGenerales].sort((a, b) => {
      const fechaA = new Date(a.fecha || '')
      const fechaB = new Date(b.fecha || '')
      if (!Number.isNaN(fechaA) && !Number.isNaN(fechaB)) return fechaB - fechaA
      if (a.id != null && b.id != null) return a.id - b.id
      return 0
    })
  }, [costosGenerales])

  const visibleCostosGenerales = useMemo(() => {
    if (!costosGeneralesOrdenados || !costosGeneralesOrdenados.length) return []
    let filtered = [...costosGeneralesOrdenados]

    // DEBUG: mostrar muestra de estados para inspección en consola
    try {
      if (typeof window !== 'undefined' && window && window.console && process.env.NODE_ENV !== 'production') {
        const sample = (costosGeneralesOrdenados || []).slice(0, 10).map((c) => ({ id: c.id, raw: c.estado_registro ?? c.estadoRegistro ?? c.estado ?? c.activo, parsed: getRegistroEstado(c) }))
        console.debug('DEBUG visibleCostosGenerales sample states:', sample)
      }
    } catch (e) {
      // ignore
    }

    // Filtrar por estado_registro usando el menú superior de costos generales
    if (costosGeneralesEstado && costosGeneralesEstado !== 'TODOS') {
      filtered = filtered.filter((costo) => {
        const reg = getRegistroEstado(costo)
        return String(reg || '').toUpperCase() === String(costosGeneralesEstado).toUpperCase()
      })
    }

    if (generalCostoFilterCategoria && generalCostoFilterCategoria !== 'todos') {
      filtered = filterCostsByCategoryId(filtered, generalCostoFilterCategoria)
    }

    if (generalCostoFilterUsuario && generalCostoFilterUsuario !== 'todos') {
      filtered = filtered.filter((costo) => {
        const usuario = String(costo.usuario || '').trim()
        return usuario === String(generalCostoFilterUsuario).trim()
      })
    }

    if (generalCostoFilterCultivo && generalCostoFilterCultivo !== 'todos') {
      filtered = filtered.filter((costo) => {
        const cultivo = String(costo.cultivo || 'General').trim()
        return cultivo === String(generalCostoFilterCultivo).trim()
      })
    }

    if (generalCostoFilterEstadoPago && generalCostoFilterEstadoPago !== 'todos') {
      filtered = filtered.filter((costo) => String(costo.estado_pago || '').trim() === String(generalCostoFilterEstadoPago).trim())
    }

    if (generalCostoFilterFechaDesde) {
      const desde = new Date(generalCostoFilterFechaDesde)
      if (!Number.isNaN(desde.getTime())) {
        filtered = filtered.filter((costo) => {
          const fecha = new Date(costo.fecha || '')
          return !Number.isNaN(fecha.getTime()) && fecha >= desde
        })
      }
    }

    if (generalCostoFilterFechaHasta) {
      const hasta = new Date(generalCostoFilterFechaHasta)
      if (!Number.isNaN(hasta.getTime())) {
        filtered = filtered.filter((costo) => {
          const fecha = new Date(costo.fecha || '')
          return !Number.isNaN(fecha.getTime()) && fecha <= hasta
        })
      }
    }

    return filtered
  }, [costosGeneralesOrdenados, costosGeneralesEstado, generalCostoFilterCategoria, generalCostoFilterEstadoPago, generalCostoFilterCultivo, generalCostoFilterUsuario, generalCostoFilterFechaDesde, generalCostoFilterFechaHasta])

  const costosGeneralesTotales = useMemo(() => {
    if (!visibleCostosGenerales || !visibleCostosGenerales.length) return { total: 0, count: 0 }
    const total = visibleCostosGenerales.reduce((acc, f) => acc + (Number(f.valor) || 0), 0)
    return { total, count: visibleCostosGenerales.length }
  }, [visibleCostosGenerales])

  const filteredCosechas = useMemo(() => {
    if (!detalleCosechas || !detalleCosechas.length) return []
    // Filtrar por estado_registro (ACTIVO / ANULADO) si se seleccionó desde el menú
    let base = [...detalleCosechas]
    if (detalleCosechasEstado && detalleCosechasEstado !== 'TODOS') {
      base = base.filter((cosecha) => {
        const reg = getRegistroEstado(cosecha)
        return String(reg || '').toUpperCase() === String(detalleCosechasEstado).toUpperCase()
      })
    }

    return base.filter((cosecha) => {
      const fecha = new Date(cosecha.fechaCosecha || cosecha.fecha_cosecha || cosecha.fechacosecha || cosecha.fecha || '')
      if (cosechaFilterFechaDesde) {
        const desde = new Date(cosechaFilterFechaDesde)
        if (Number.isNaN(desde.getTime()) || Number.isNaN(fecha.getTime()) || fecha < desde) {
          return false
        }
      }
      if (cosechaFilterFechaHasta) {
        const hasta = new Date(cosechaFilterFechaHasta)
        if (Number.isNaN(hasta.getTime()) || Number.isNaN(fecha.getTime()) || fecha > hasta) {
          return false
        }
      }
      return true
    })
  }, [detalleCosechas, detalleCosechasEstado, cosechaFilterFechaDesde, cosechaFilterFechaHasta])
  const rentabilidadRows = useMemo(() =>
    (dashboardDataActivos?.rentability || dashboardData?.rentability || [])
      .filter((row) => {
        const raw = row.estado_registro ?? row.estadoRegistro ?? row.activo
        if (raw == null) return true
        const state = String(raw).trim().toUpperCase()
        return !['0', 'FALSE', 'F', 'ANULADO', 'INACTIVO', 'DESACTIVADO', 'ELIMINADO'].includes(state)
      })
      .map((row) => {
        const ingresos = Number(row.ingresos) || 0
        const costo = Number(row.costo) || 0
        const ganancia = Number(row.ganancia) || 0
        const margen = row.margen != null && Number.isFinite(Number(row.margen))
          ? Number(row.margen)
          : ingresos > 0 ? (ganancia / ingresos) * 100 : 0

        return { ...row, ingresos, costo, ganancia, margen }
      }),
    [dashboardData, dashboardDataActivos]
  )

  const rentabilidadTotals = useMemo(() => {
    const rows = rentabilidadRows || []
    const totalCosto = rows.reduce((acc, r) => acc + (Number(r.costo) || 0), 0)
    const totalGanancia = rows.reduce((acc, r) => acc + (Number(r.ganancia) || 0), 0)
    const totalIngresos = rows.reduce((acc, r) => acc + (Number(r.ingresos) || 0), 0)
    const margen = totalIngresos > 0 ? (totalGanancia / totalIngresos) * 100 : 0
    return {
      totalCosto,
      totalGanancia,
      totalIngresos,
      margen,
    }
  }, [rentabilidadRows])

  const etapasRows = (() => {
    // Filtrar por búsqueda y estado
    let etapasFiltradas = etapasCultivoOrdenadas.filter((etapa) => {
      // Filtro por nombre
      const cumpleBusqueda = !searchEtapaInput || 
        etapa.nombre.toLowerCase().includes(searchEtapaInput.toLowerCase())
      
      // Filtro por estado de etapa
      const cumpleEstado = !filterEtapaEstado || filterEtapaEstado === 'todos' || 
        (etapa.estado && etapa.estado.toLowerCase().replace(/\s+/g, '-') === filterEtapaEstado.toLowerCase().replace(/\s+/g, '-'))

      // Filtro por estado de registro (ACTIVO / ANULADO) desde el menú superior
      const estadoRegistroEtapa = getRegistroEstado(etapa)
      const cumpleEstadoRegistro = !etapasEstado || etapasEstado === 'TODOS' || estadoRegistroEtapa === etapasEstado
      
      return cumpleBusqueda && cumpleEstado && cumpleEstadoRegistro
    })

    if (etapasFiltradas.length === 0) {
      return (
        <tr className="data-item">
          <td colSpan={etapasEstado === 'ACTIVO' && isSelectedCultivoActivo ? 6 : 5} style={{ textAlign: 'center' }}>
            No se encontraron registros asociados.
          </td>
        </tr>
      )
    }

    return etapasFiltradas.map((etapa, i) => {
      const estadoLower = String(etapa.estado || '').toLowerCase()
      const isActiveStage = estadoLower === 'en proceso'
      return (
        <tr key={i} className="data-item" style={isActiveStage ? { backgroundColor: '#e7f6ff' } : undefined}>
          <td data-field="nombre">
            <span className="detalle-cultivo-badge-etapa">{etapa.nombre}</span>
          </td>
          <td data-field="descripcion">{etapa.descripcion || '--'}</td>
          <td data-field="fecha-inicio">{formatDateValue(etapa.fechaInicio)}</td>
          <td data-field="fecha-final">{formatDateValue(etapa.fechaFinal)}</td>
          <td data-field="estado">
            <span className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${String(etapa.estado || 'desconocido').toLowerCase().replace(/\s+/g, '-')}`}>
              {etapa.estado.replace('-', ' ')}
            </span>
          </td>
          {etapasEstado === 'ACTIVO' && isSelectedCultivoActivo && (
            <td data-field="acciones">
              <div className="action-buttons">
                <button type="button" className="btn-icon btn-edit" title="Editar" onClick={() => handleOpenEditEtapa(etapa)}>{'\u270F\uFE0F'}</button>
                <button type="button" className="btn-icon btn-delete" title="Anular" onClick={() => handleDeleteEtapa(etapa)}>{'\uD83D\uDEAB'}</button>
              </div>
            </td>
          )}
        </tr>
      )
    })
  })()


  // Cuando estamos en el dashboard, actualiza los gráficos usando el servicio adminCharts.
  useEffect(() => {
    if (activeSection !== 'dashboard' || !dashboardData) return
    const activeDashboardData = dashboardDataActivos || dashboardData
    const id = window.setTimeout(() => {
      updateAdminDashboardCharts(activeDashboardData, {
        chartProduccion: cpRef,
        chartCostos: ccRef,
        chartCategoriaCostos: ccatRef,
        chartRentabilidad: crRef,
      })
    }, 120)
    return () => window.clearTimeout(id)
  }, [activeSection, dashboardData, dashboardDataActivos])

  // Cuando estamos en la sección de rentabilidad, actualiza sus gráficos.
  useEffect(() => {
    const chartRefs = {
      chartRentabilidadDetallada: crdRef,
      chartComparativaIngresosCostos: cicRef,
    }
    if (activeSection !== 'rentabilidad') return
    if (isLoadingDashboard || dashboardError || !dashboardData || rentabilidadRows.length === 0) {
      clearRentabilidadCharts(chartRefs)
      return
    }
    const activeDashboardData = dashboardDataActivos || dashboardData
    const id = window.setTimeout(() => {
      updateRentabilidadCharts(activeDashboardData, chartRefs)
    }, 120)
    return () => {
      window.clearTimeout(id)
      clearRentabilidadCharts(chartRefs)
    }
  }, [activeSection, dashboardData, dashboardDataActivos, dashboardError, isLoadingDashboard, rentabilidadRows.length])

  // Escucha el evento de cambio de finca y actualiza los gráficos de la sección activa.
  useEffect(() => {
    const handler = () => {
      if (!dashboardData) return
      const activeDashboardData = dashboardDataActivos || dashboardData
      if (activeSection === 'dashboard') {
        window.setTimeout(() => {
          updateAdminDashboardCharts(activeDashboardData, {
            chartProduccion: cpRef,
            chartCostos: ccRef,
            chartCategoriaCostos: ccatRef,
            chartRentabilidad: crRef,
          })
        }, 50)
      }
      if (activeSection === 'rentabilidad') {
        window.setTimeout(() => {
          updateRentabilidadCharts(activeDashboardData, {
            chartRentabilidadDetallada: crdRef,
            chartComparativaIngresosCostos: cicRef,
          })
        }, 50)
      }
      if (reportVisible && reportType) {
        /* mismo tipo, datos actualizados al renderizar */
      }
    }
    window.addEventListener('agro:fincaChanged', handler)
    return () => window.removeEventListener('agro:fincaChanged', handler)
  }, [activeSection, dashboardData, reportVisible, reportType])

  useEffect(() => {
    localStorage.setItem('activeSection', activeSection)
    if (selectedCultivoId) {
      localStorage.setItem('selectedCultivoId', String(selectedCultivoId))
    } else {
      localStorage.removeItem('selectedCultivoId')
    }

    if (activeSection === 'detalle-cultivo' && selectedCultivoId) {
      const cultivo = cultivos.find((c) => c.id === selectedCultivoId)
      setPageTitle(`Detalle del Cultivo: ${cultivo?.nombre || ''}`)
    } else {
      setPageTitle(SECTION_TITLES[activeSection] || 'Dashboard')
    }
  }, [activeSection, selectedCultivoId, cultivos])

  // Cambia la sección activa del panel y guarda la selección en localStorage.
  const switchSection = (sectionId) => {
    if (sectionId !== 'detalle-cultivo') {
      setSelectedCultivoId(null)
    }
    setActiveSection(sectionId)
  }

  // Cambia la finca seleccionada y notifica al usuario.
  const onFincaChange = (id) => {
    Agro.setSelectedFincaId(id)
    setFincaId(id)
    const fincaNombre = fincas.find((f) => String(f.id) === String(id))?.nombre || id
    showNotification(`Finca ${fincaNombre} seleccionada`)
  }

  // Cierra sesión y redirige a la página de inicio.
  const onLogout = async () => {
    playWarning()
    const result = await Swal.fire({
      title: 'AgroGestion',
      text: '¿Estás seguro de que deseas cerrar sesión?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#ffffff',
      customClass: {
        cancelButton: 'custom-cancel-btn',
        confirmButton: 'custom-confirm-btn',
      },
    })

    if (!result.isConfirmed) return

    // Llamar al endpoint de logout para cerrar sesión en el servidor
    await logoutUser()

    // Limpiar tokens en el cliente
    clearTokens()
    navigate('/', { replace: true })
  }

  // Abre la vista de detalle de un cultivo específico.
  const openCultivoDetalle = (cultivo) => {
    setSelectedCultivoId(cultivo.id)
    setActiveSection('detalle-cultivo')
    setElementosCultivo({ open: false, rows: [] })
  }

  // Regresa de la vista de detalle a la lista de cultivos.
  const backToCultivos = () => {
    setSelectedCultivoId(null)
    setElementosCultivo({ open: false, rows: [] })
    switchSection('cultivos')
    setPageTitle('Gestión de Cultivos')
  }

  // Desplaza suavemente la pantalla hacia una sección específica.
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Configuración de los enlaces del menú lateral.
  const navItems = [
    {
      title: 'Principal',
      links: [{ section: 'dashboard', label: 'Dashboard', icon: '📊' }],
    },
    {
      title: 'Gestión',
      links: [
        { section: 'fincas', label: 'Fincas', icon: '🏠' },
        { section: 'usuarios', label: 'Usuarios', icon: '👥' },
        { section: 'cultivos', label: 'Cultivos', icon: '🌱' },
      ],
    },
    {
      title: 'Operaciones',
      links: [
        { section: 'reportes', label: 'Reportes', icon: '📋' },
        { section: 'costos', label: 'Costos Generales', icon: '💰' },
      ],
    },
    {
      title: 'Análisis',
      links: [
        { section: 'rentabilidad', label: 'Rentabilidad', icon: '📈' },
      ],
    },
    {
      title: 'Configuración',
      links: [
        { section: 'configuracion', label: 'Configuración', icon: '⚙️' },
      ],
    },
  ]

  // (openReport definido más abajo con carga de datos)

  const buildReportExportFilters = () => {
    const optionLabel = (options, id, fallbackPrefix) => {
      const selected = options.find((option) => String(option.id) === String(id))
      return selected ? selected.nombre : `${fallbackPrefix} ${id}`
    }
    const filters = []
    if (fincaId) filters.push({ label: 'Finca', value: optionLabel(fincasData, fincaId, 'ID') })
    if (filtroCultivo) filters.push({ label: 'Cultivo', value: optionLabel(filterOptions.cultivos, filtroCultivo, 'ID') })
    if (filtroCategoriaCosto) filters.push({ label: 'Categoría', value: optionLabel(filterOptions.categorias, filtroCategoriaCosto, 'ID') })
    if (filtroSubcategoriaCosto) filters.push({ label: 'Subcategoría', value: optionLabel(filterOptions.subcategorias, filtroSubcategoriaCosto, 'ID') })
    if (filtroUsuario) {
      const usuario = filterOptions.usuarios.find((option) => String(option.id) === String(filtroUsuario))
      filters.push({ label: 'Usuario', value: usuario ? `${usuario.nombre} ${usuario.apellidos || ''}`.trim() : `ID ${filtroUsuario}` })
    }
    if (filtroEstadoCultivo) filters.push({ label: 'Estado del cultivo', value: optionLabel(filterOptions.estados, filtroEstadoCultivo, 'ID') })
    if (filtroFechaInicio) filters.push({ label: 'Desde', value: filtroFechaInicio })
    if (filtroFechaFin) filters.push({ label: 'Hasta', value: filtroFechaFin })
    return filters
  }

  const exportReport = async (format) => {
    if (!reportType || !Array.isArray(reportData) || isLoadingReport) {
      showNotification('Genera un reporte antes de exportarlo', 'error')
      return
    }

    try {
      const filters = buildReportExportFilters()
      const auditFormat = format === 'PDF' ? 'PDF' : 'EXCEL'
      await reportService.registerReportExport(reportType, auditFormat, buildFiltersObject(reportType))

      if (format === 'PDF') {
        await exportReportToPdf(reportType, reportData, filters)
      } else {
        await exportReportToExcel(reportType, reportData, filters)
      }
      showNotification(`Reporte exportado a ${format}`, 'success')
    } catch (error) {
      console.error(`Error al exportar el reporte a ${format}:`, error)
      showNotification(`No se pudo exportar el reporte a ${format}`, 'error')
    }
  }

  const recentActivities = dashboardData?.recentActivities || []
  const alertItems = dashboardData?.alerts || []
  const alertIcons = {
    warning: '⚠️',
    danger: '🚨',
    info: 'ℹ️',
    success: '✅',
  }

  const cultivosEstadoCards = cultivosEnFinca.map((c) => {
    const estadoLower = (c.estado || '').toLowerCase()
    let badgeClass = 'active'
    if (estadoLower === 'finalizado') badgeClass = 'completed'
    if (estadoLower === 'perdido') badgeClass = 'lost'

    const badgeText = estadoLower === 'finalizado' ? 'Finalizado' : estadoLower === 'perdido' ? 'Perdido' : 'Activo'

    return (
      <div key={c.id} className="cultivo-card">
        <div className="cultivo-header">
          <h4>{c.nombre}</h4>
          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
        </div>
        <div className="cultivo-content">
          <p>
            <strong>Inicio:</strong> {c.fechaInicio || '--'}
          </p>
          <p>
            <strong>Fin:</strong> {c.fechaFinal || '--'}
          </p>
          <p>
            <strong>Ganancia:</strong> {Agro.formatCOP(c.ganancia)}
          </p>
          <p>
            <strong>Costo:</strong> {Agro.formatCOP(c.costo)}
          </p>
        </div>
      </div>
    )
  })

  return (
    <div className="container">
      {/* Modal dinámico que se usa para crear o editar usuarios, cultivos, costos o fincas. */}
      <DynamicModal
        isOpen={showDynamicModal}
        modalType={dynamicModalType}
        isEditing={Boolean(editingUser || editingFinca || editingCultivo || editingEtapa || editingCosto || editingCosecha)}
        onClose={handleCloseDynamicModal}
        onSubmit={handleSubmitDynamicModal}
        title={
          editingCosecha ? 'Editar Cosecha' :
          editingCosto ? 'Editar costo' :
          dynamicModalType === MODAL_TYPES.COSTO ? 'Agregar nuevo costo' :
          editingFinca ? 'Editar Finca' :
          editingCultivo ? 'Editar Cultivo' :
          editingUser ? 'Editar Usuario' :
          editingEtapa ? 'Editar Etapa' :
          undefined
        }
        submitButtonText={
          editingCosecha ? 'Actualizar Cosecha' :
          editingCosto ? 'Actualizar costo' :
          dynamicModalType === MODAL_TYPES.COSTO ? 'Agregar costo' :
          editingFinca ? 'Actualizar Finca' :
          editingCultivo ? 'Actualizar Cultivo' :
          editingUser ? 'Actualizar Usuario' :
          editingEtapa ? 'Actualizar Etapa' :
          undefined
        }
        fieldOptions={modalFieldOptions}
        initialData={dynamicModalInitialData}
        onFieldChange={(name, value) => {
          if (dynamicModalType === MODAL_TYPES.COSTO) {
            handleCostoFieldChange(name, value)
          }
          if (name === 'departamento') {
            const municipios = value ? (MUNICIPIOS_POR_DEPARTAMENTO[value] || []) : []
            setModalFieldOptions((prev) => ({
              ...prev,
              municipio: municipios.map((m) => ({ value: m, label: m })),
            }))
          }
        }}
      />


      

      {/* Barra lateral con navegación, selección de finca y opción de cerrar sesión. */}
      <Sidebar
        roleSubtitle="Rol: Administrador"
        fincaOptions={fincasSelectorOptions}
        fincaLoading={isLoadingFincasSelector}
        fincaValue={fincaId}
        onFincaChange={onFincaChange}
        navItems={navItems}
        activeNavSection={activeSection === 'detalle-cultivo' ? null : activeSection}
        onNavClick={switchSection}
        accountName={accountFullName}
        accountEmail={session?.email || 'correo@agro.com'}
        onLogout={onLogout}
      />

      <main className="main-content">
        {/* Encabezado principal que muestra el título actual y permite navegar dentro de un cultivo. */}
        <Header
          title={pageTitle}
          showNavCultivo={activeSection === 'detalle-cultivo'}
          onScrollToSection={scrollToSection}
        />

        <div className="content-container">
          {/* Sección de dashboard general con indicadores clave, gráficos y alertas. */}
          <section id="dashboard-section" className={`content-section ${activeSection === 'dashboard' ? 'active' : ''}`}>
            {dashboardError ? (
              <div className="dashboard-error" style={{ marginBottom: 16, color: '#c0392b' }}>
                {dashboardError}
              </div>
            ) : null}
            {isLoadingDashboard ? (
              <div className="dashboard-loading" style={{ marginBottom: 16, color: '#34495e' }}>
                Cargando información del dashboard...
              </div>
            ) : null}
            <div className="dashboard-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: 16, alignItems: 'center' }}>
              <div className="dashboard-filter-item" style={{ display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="dashboard-month" style={{ fontSize: '0.9rem', marginBottom: '4px' }}>Mes</label>
                <select
                  id="dashboard-month"
                  value={dashboardMonth}
                  onChange={(event) => setDashboardMonth(event.target.value)}
                  style={{ padding: '8px', minWidth: '150px' }}
                >
                  {MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dashboard-filter-item" style={{ display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="dashboard-year" style={{ fontSize: '0.9rem', marginBottom: '4px' }}>Año</label>
                <select
                  id="dashboard-year"
                  value={dashboardYear}
                  onChange={(event) => setDashboardYear(event.target.value)}
                  style={{ padding: '8px', minWidth: '150px' }}
                >
                  {YEAR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 20, height: '42px' }}
                onClick={() => {
                  setDashboardMonth('')
                  setDashboardYear('')
                }}
              >
                Limpiar filtros
              </button>
            </div>
            <div className="kpi-container">
              <div className="kpi-card">
                <div className="kpi-header">
                  <h3>Costos</h3>
                  <span className="icon">💸</span>
                </div>
                <div className="kpi-value">{Agro.formatCOP(dashboardResumen.costos)}</div>
                <div className="kpi-subtext">{costTrendText}</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <h3>Ingresos</h3>
                  <span className="icon">📦</span>
                </div>
                <div className="kpi-value">{Agro.formatCOP(dashboardResumen.ingresos)}</div>
                <div className="kpi-subtext">{ingresosSubtext}</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <h3>Ganancia</h3>
                  <span className="icon">📈</span>
                </div>
                <div className="kpi-value" id="kpiGananciaTotal">{Agro.formatCOP(dashboardResumen.ganancia)}</div>
                <div className="kpi-subtext">Margen estimado</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <h3>Producción Total</h3>
                  <span className="icon">📦</span>
                </div>
                <div className="kpi-value" id="kpiProduccionTotal">{resumen.produccionKg.toLocaleString('es-CO')} kg</div>
                <div className="kpi-subtext">Basado en cosechas registradas</div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Producción en el Tiempo</h3>
                <div className="chart-wrapper">
                  <canvas ref={cpRef} id="chartProduccion" />
                </div>
              </div>
              <div className="chart-card">
                <h3>Costos en el Tiempo</h3>
                <div className="chart-wrapper">
                  <canvas ref={ccRef} id="chartCostos" />
                </div>
              </div>
              <div className="chart-card">
                <h3>Costos por Categoría</h3>
                <div className="chart-wrapper">
                  <canvas ref={ccatRef} id="chartCategoriaCostos" />
                </div>
              </div>
              <div className="chart-card">
                <h3>Rentabilidad por Cultivo</h3>
                <div className="chart-wrapper">
                  <canvas ref={crRef} id="chartRentabilidad" />
                </div>
              </div>
            </div>

            <div className="cultivos-estado">
              <h2>Estado de Cultivos</h2>
              <div className="cultivos-grid" id="cultivosEstadoGrid">
                {cultivosEstadoCards.length > 0 ? (
                  cultivosEstadoCards
                ) : (
                  <p style={{ padding: 10, color: 'var(--text-light)' }}>Sin cultivos para la finca seleccionada.</p>
                )}
              </div>
            </div>

            <div className="timeline-section">
              <h2>Actividades Recientes</h2>
              <div className="timeline">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity, index) => (
                    <div key={`${activity.type}-${activity.occurredAt}-${index}`} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <h4>{activity.title}</h4>
                        <p>{activity.description}</p>
                        <time>{activity.occurredAt}</time>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ padding: 10, color: 'var(--text-light)' }}>No hay actividades recientes para la finca seleccionada.</p>
                )}
              </div>
            </div>

            <div className="alerts-section">
              <h2>Alertas y Advertencias</h2>
              <div className="alerts-grid">
                {alertItems.length > 0 ? (
                  alertItems.map((alert, index) => (
                    <div key={`${alert.type}-${index}`} className={`alert-card alert-${alert.type}`}>
                      <span className="alert-icon">{alertIcons[alert.type] || 'ℹ️'}</span>
                      <div className="alert-content">
                        <h4>{alert.title}</h4>
                        <p>{alert.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="alert-card alert-info">
                    <span className="alert-icon">ℹ️</span>
                    <div className="alert-content">
                      <h4>Sin alertas por el momento</h4>
                      <p>La finca no reporta eventos críticos ni advertencias recientes.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Sección de gestión de fincas: lista, búsqueda y botones de acción. */}
          {/* Sección de gestión de fincas: lista, búsqueda y botones de acción. */}
          <section id="fincas-section" className={`content-section ${activeSection === 'fincas' ? 'active' : ''}`}>
            <div className="section-header">
              <div className="search-wrapper">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar por nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button type="button" className="btn-search" onClick={handleBuscarFincas}>
                  Limpiar
                </button>
              </div>
              <button type="button" className="btn-add btn-primary" onClick={() => handleOpenFincaModal()}>
                + Agregar Nueva Finca
              </button>
            </div>
            <StateFilterMenu
              states={[ 'ACTIVO', 'ARCHIVADO' ]}
              activeState={fincasEstado}
              onStateChange={(s) => setFincasEstado(s)}
              labels={{ ACTIVO: 'ACTIVO', ARCHIVADO: 'ARCHIVADO' }}
            />
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr className="table-title-row">
                    <th colSpan={4}>Fincas Registradas</th>
                  </tr>
                  <tr>
                    <th>Nombre</th>
                    <th>Ubicación</th>
                    <th>Cultivos activos</th>
                    {fincasEstado === 'ACTIVO' && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {isLoadingFincas ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
                        Cargando fincas...
                      </td>
                    </tr>
                  ) : fincas.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
                        No se encontraron registros asociados.
                      </td>
                    </tr>
                  ) : (
                    fincas.map((finca) => {
                      const cultivosActivos = countCultivosActivosByFinca(finca.id)
                      return (
                        <tr
                          key={finca.id}
                          className="data-item"
                            onClick={() => {
                            // Solo permitir seleccionar finca cuando el filtro sea ACTIVO.
                            // Cuando es ARCHIVADO, la tabla es solo lectura y NO debe cambiar `fincaId`.
                            if (fincasEstado !== 'ACTIVO') return

                            // Asegurar que la finca está en fincasSelectorOptions
                            if (!fincasSelectorOptions.some((f) => f.id === finca.id)) {
                              setFincasSelectorOptions([...fincasSelectorOptions, finca])
                            }
                            onFincaChange(String(finca.id))
                          }}
                          style={{ cursor: fincasEstado === 'ACTIVO' ? 'pointer' : 'default' }}
                        >
                          <td data-field="nombre">{finca.nombre}</td>
                          <td data-field="ubicacion">{finca.ubicacion || '--'}</td>
                          <td data-field="cultivos">{cultivosActivos}</td>
                          {fincasEstado === 'ACTIVO' && (
                            <td data-field="acciones" onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-icon btn-edit"
                                  title="Editar"
                                  onClick={() => handleOpenFincaModal(finca)}
                                >
                                  {'\u270F\uFE0F'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon btn-delete"
                                  title="Archivar"
                                  onClick={() => handleDeleteFinca(finca.id)}
                                >
                                  {'\uD83D\uDCC2'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sección de gestión de usuarios: búsqueda, lista y edición/ eliminación. */}
          <section id="usuarios-section" className={`content-section ${activeSection === 'usuarios' ? 'active' : ''}`}>
            <div className="section-header">
              <div className="search-wrapper">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar por nombre..."
                  value={filtroUsuario}
                  onChange={(e) => setFiltroUsuario(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={() => setFiltroUsuario('')}
                >
                  Limpiar
                </button>
              </div>
              <button type="button" className="btn-add btn-primary" onClick={() => handleOpenDynamicModal(MODAL_TYPES.USUARIO)}>
                + Agregar Nuevo Usuario
              </button>
            </div>
            <StateFilterMenu
              states={[ 'ACTIVO', 'DESACTIVADO' ]}
              activeState={usuariosEstado}
              onStateChange={(s) => setUsuariosEstado(s)}
              labels={{ ACTIVO: 'ACTIVO', DESACTIVADO: 'DESACTIVADO' }}
            />
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr className="table-title-row">
                    <th colSpan={5}>Usuarios Registrados</th>
                  </tr>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Contraseña</th>
                    <th>Rol</th>
                    {usuariosEstado === 'ACTIVO' && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((usuario) => {
                    const isWorker = usuario.rol?.toString().toLowerCase() === 'trabajador'

                    return (
                      <tr
                        key={usuario.id}
                        className={`data-item ${isWorker ? 'usuario-clickeable' : ''} ${activeUsuarioId === usuario.id ? 'activo' : ''}`}
                        onClick={(e) => {
                          if (!isWorker) return
                          if (e.target.closest('.action-buttons')) return
                          setActiveUsuarioId(usuario.id)
                          setAsignacionesOpen(true)
                          setTimeout(() => document.getElementById('asignaciones-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                        }}
                      >
                        <td data-field="nombre">{`${usuario.nombre} ${usuario.apellidos || ''}`.trim()}</td>
                        <td data-field="email">{usuario.email}</td>
                        <td data-field="password">{usuario.password}</td>
                        <td data-field="rol">{usuario.rol}</td>
                        {usuariosEstado === 'ACTIVO' && (
                          <td data-field="acciones">
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="btn-icon btn-edit"
                                title="Editar"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenEditUser(usuario)
                                }}
                              >
                                {'\u270F\uFE0F'}
                              </button>
                              <button
                                type="button"
                                className="btn-icon btn-delete"
                                title="Desactivar"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteUser(usuario.id)
                                }}
                              >
                                {'\uD83D\uDD12'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="no-results-row">
                        No se encontraron registros asociados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="info-section" id="asignaciones-section" style={{ display: asignacionesOpen ? 'block' : 'none', marginTop: 40 }}>
              <div className="section-info-header">
                <h3>
                  Asignaciones de{' '}
                  <span id="usuario-nombre-asignaciones">
                    {users.find((u) => u.id === activeUsuarioId)?.nombre || '--'}
                  </span>
                </h3>
                <button
                  type="button"
                  className="btn-close-asignaciones"
                  id="btn-close-asignaciones"
                  onClick={() => {
                    setAsignacionesOpen(false)
                    setActiveUsuarioId(null)
                  }}
                >
                  ✕ Cerrar
                </button>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr className="table-title-row">
                      <th colSpan={2}>Asignaciones</th>
                    </tr>
                    <tr>
                      <th>Fincas Asignadas</th>
                      <th>Cultivos Asignados</th>
                    </tr>
                  </thead>
                  <tbody id="asignaciones-tbody">
                    {activeUsuarioAssignments.length > 0 ? (
                      activeUsuarioAssignments.map((a, i) => (
                        <tr key={i} className="data-item">
                          <td data-field="finca">{a.finca}</td>
                          <td data-field="cultivos">{a.cultivos}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="data-item">
                        <td colSpan={2} style={{ textAlign: 'center', color: '#666' }}>
                          No hay asignaciones registradas para este trabajador.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Sección de cultivos: lista por finca y acceso a detalles individuales. */}
          <section id="cultivos-section" className={`content-section ${activeSection === 'cultivos' ? 'active' : ''}`}>
            <div className="section-header">
              <div className="search-wrapper" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar cultivo por nombre..."
                  value={searchCultivoTerm}
                  onChange={(e) => setSearchCultivoTerm(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={() => setSearchCultivoTerm('')}
                >
                  Limpiar
                </button>
              </div>
              <div className="filter-wrapper">
                <label className="filter-label">Filtrar por estado:</label>
                <select
                  className="filter-select"
                  value={filtroEstadoCultivo || 'todos'}
                  onChange={(e) => setFiltroEstadoCultivo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {estadoOptions.map((estado) => (
                    <option key={estado.id} value={estado.id}>
                      {estado.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-add btn-primary" onClick={() => handleOpenDynamicModal(MODAL_TYPES.CULTIVO)}>
                + Agregar Nuevo Cultivo
              </button>
            </div>
            <StateFilterMenu
              states={[ 'ACTIVO', 'ARCHIVADO' ]}
              activeState={cultivosEstado}
              onStateChange={(s) => setCultivosEstado(s)}
              labels={{ ACTIVO: 'ACTIVO', ARCHIVADO: 'ARCHIVADO' }}
            />
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr className="table-title-row">
                    <th colSpan={7}>Cultivos Registrados</th>
                  </tr>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Fecha Inicio</th>
                    <th>Fecha Final</th>
                    <th>Etapa Actual</th>
                    <th>Estado</th>
                    {cultivosEstado === 'ACTIVO' && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCultivos && filteredCultivos.length > 0 ? (
                    filteredCultivos.map((c) => (
                      <tr
                        key={c.id}
                        className="data-item"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          if (e.target.closest('.action-buttons')) return
                          openCultivoDetalle(c)
                        }}
                      >
                        <td data-field="nombre">{capitalizeWords(c.nombre || '--')}</td>
                        <td data-field="tipo">{c.tipo || '--'}</td>
                        <td data-field="fecha-siembra">{formatDateValue(c.fechaInicio || c.fecha_inicio || c.fechainicio)}</td>
                        <td data-field="fecha-cosecha">{formatDateValue(c.fechaCosecha || c.fecha_cosecha || c.fechacosecha)}</td>
                        <td data-field="etapa-actual">{c.etapaActual || '--'}</td>
                        <td data-field="estado">
                          {
                            (() => {
                              const estadoLower = (c.estado || '').toLowerCase()
                              const className = `status-badge status-${estadoLower.replace(/\s+/g, '-') || 'desconocido'}`
                              const style = estadoLower === 'perdido' ? { backgroundColor: '#c0392b', color: '#fff' } : undefined
                              return (
                                <span className={className} style={style}>
                                  {c.estado || '--'}
                                </span>
                              )
                            })()
                          }
                        </td>
                        {cultivosEstado === 'ACTIVO' && (
                          <td data-field="acciones">
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="btn-icon btn-edit"
                                title="Editar"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenEditCultivo(c)
                                }}
                              >
                                {'\u270F\uFE0F'}
                              </button>
                              <button type="button" className="btn-icon btn-delete" title="Archivar"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteCultivo(c.id)
                                }}
                              >
                                {'\uD83D\uDCC2'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr className="data-item">
                      <td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>
                        No se encontraron registros asociados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sección de detalle de cultivo con etapas, cosechas y costos asociados. */}
          <section id="detalle-cultivo-section" className={`content-section ${activeSection === 'detalle-cultivo' ? 'active' : ''}`}>
            <div className="section-header">
              <button type="button" className="btn-back" id="btn-back-cultivos" onClick={backToCultivos}>
                ← Volver a Cultivos
              </button>
            </div>

            {cultivoSeleccionado ? (
              <>
                <div className="cultivo-estado-container">
                  <label className="estado-label">Estado actual:</label>
                  {(() => {
                    const rawEstado = cultivoSeleccionado.estado || ''
                    const estadoClass = rawEstado ? rawEstado.toLowerCase().replace(/\s+/g, '-') : 'desconocido'
                    const estadoLabel = rawEstado
                      ? rawEstado.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
                      : '--'
                    return (
                      <span id="cultivo-estado-badge" className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${estadoClass}`}>
                        {estadoLabel}
                      </span>
                    )
                  })()}
                </div>
                {!isSelectedCultivoActivo && (
                  <div className="detalle-cultivo-readonly-note">
                    <div className="readonly-note-icon">📌</div>
                    <div className="readonly-note-content">
                      <strong>Este cultivo está archivado.</strong>
                      <p>La información puede consultarse en esta vista, pero no está disponible para edición.</p>
                    </div>
                  </div>
                )}

                <div className="info-section" id="etapas-section">
                  <div className="section-info-header">
                    <h3>Etapas</h3>
                    {isSelectedCultivoActivo && (
                      <button type="button" className="btn-add btn-primary" onClick={openAddEtapaModal}>
                        + Agregar Nueva Etapa
                      </button>
                    )}
                  </div>
                  <div className="search-filter-wrapper">
                    <div className="search-wrapper">
                      <input 
                        type="text" 
                        className="search-input" 
                        placeholder="Buscar por nombre..." 
                        value={searchEtapaInput}
                        onChange={(e) => setSearchEtapaInput(e.target.value)}
                      />
                      <button 
                        type="button" 
                        className="btn-search"
                        onClick={() => setSearchEtapaInput('')}
                      >
                        Limpiar
                      </button>
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por estado:</label>
                      <select 
                        className="filter-select" 
                        value={filterEtapaEstado}
                        onChange={(e) => setFilterEtapaEstado(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        <option value="en-proceso">En Proceso</option>
                        <option value="finalizado">Finalizado</option>
                      </select>
                    </div>
                  </div>
                  <StateFilterMenu
                    states={[ 'ACTIVO', 'ANULADO' ]}
                    activeState={etapasEstado}
                    onStateChange={(s) => setEtapasEstado(s)}
                    labels={{ ACTIVO: 'ACTIVOS', ANULADO: 'ANULADOS' }}
                  />
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr className="table-title-row">
                          <th colSpan={etapasEstado === 'ACTIVO' && isSelectedCultivoActivo ? 6 : 5}>Etapas Registradas</th>
                        </tr>
                        <tr>
                          <th>Nombre</th>
                          <th>Descripción</th>
                          <th>Fecha Inicio</th>
                          <th>Fecha Final</th>
                          <th>Estado</th>
                          {etapasEstado === 'ACTIVO' && isSelectedCultivoActivo && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {etapasRows}
                      </tbody>
                    </table>
                  </div>
                  {/* DynamicModal will be used instead of inline modal */}
                </div>

                <div className="info-section" id="cosechas-section">
                  <div className="section-info-header">
                    <h3>Cosechas</h3>
                    {isSelectedCultivoActivo && (
                      <button type="button" className="btn-add btn-primary" onClick={handleOpenAgregarCosecha}>
                        + Agregar Nueva Cosecha
                      </button>
                    )}
                  </div>
                  <div className="search-filter-wrapper">
                    <div className="filter-wrapper">
                      <label className="filter-label">Desde:</label>
                      <input
                        type="date"
                        className="filter-date"
                        value={cosechaFilterFechaDesde}
                        onChange={(e) => setCosechaFilterFechaDesde(e.target.value)}
                      />
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Hasta:</label>
                      <input
                        type="date"
                        className="filter-date"
                        value={cosechaFilterFechaHasta}
                        onChange={(e) => setCosechaFilterFechaHasta(e.target.value)}
                      />
                    </div>
                  </div>
                  <StateFilterMenu
                    states={[ 'ACTIVO', 'ANULADO' ]}
                    activeState={detalleCosechasEstado}
                    onStateChange={(s) => setDetalleCosechasEstado(s)}
                    labels={{ ACTIVO: 'ACTIVOS', ANULADO: 'ANULADOS' }}
                  />
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr className="table-title-row">
                          <th colSpan={detalleCosechasEstado === 'ACTIVO' && isSelectedCultivoActivo ? 6 : 5}>Cosechas Realizadas</th>
                        </tr>
                        <tr>
                          <th>Fecha</th>
                          <th>Cantidad</th>
                          <th>Unidad Medida</th>
                          <th>Precio</th>
                          <th>Tipo Precio</th>
                          {detalleCosechasEstado === 'ACTIVO' && isSelectedCultivoActivo && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingDetalleCosechas ? (
                          <tr className="data-item">
                            <td colSpan={detalleCosechasEstado === 'ACTIVO' && isSelectedCultivoActivo ? 6 : 5} style={{ textAlign: 'center' }}>
                              Cargando cosechas...
                            </td>
                          </tr>
                        ) : filteredCosechas.length === 0 ? (
                          <tr className="data-item">
                            <td colSpan={detalleCosechasEstado === 'ACTIVO' && isSelectedCultivoActivo ? 6 : 5} style={{ textAlign: 'center' }}>
                              No se encontraron registros asociados.
                            </td>
                          </tr>
                        ) : (
                          filteredCosechas.map((cosecha, i) => (
                            <tr key={cosecha.id ?? i} className="data-item">
                              <td data-field="fecha">{formatDateValue(cosecha.fechaCosecha || cosecha.fecha_cosecha || cosecha.fechacosecha || cosecha.fecha)}</td>
                              <td data-field="cantidad">{formatCantidadValue(cosecha.cantidad || cosecha.cantidad_cosechada)}</td>
                              <td data-field="unidad">{cosecha.unidad || cosecha.unidad_medida || cosecha.unidad?.nombre || cosecha.unidadMedida}</td>
                              <td data-field="precio">{formatPrecioValue(cosecha.precio || cosecha.precio_unitario)}</td>
                              <td data-field="tipo-precio">{cosecha.tipoPrecio || cosecha.tipoprecio || cosecha.tipoPrecio?.nombre || cosecha.tipo_precio || cosecha.tipoPrecioId || cosecha.tipoprecioid || ''}</td>
                              {detalleCosechasEstado === 'ACTIVO' && isSelectedCultivoActivo && (
                                <td data-field="acciones">
                                  <div className="action-buttons">
                                    <button type="button" className="btn-icon btn-edit" title="Editar" onClick={() => handleOpenEditCosecha(cosecha)}>
                                      {'\u270F\uFE0F'}
                                    </button>
                                    <button type="button" className="btn-icon btn-delete" title="Anular" onClick={() => handleDeleteCosecha(cosecha)}>
                                      {'\uD83D\uDEAB'}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="info-section" id="costos-cultivo-section">
                  <div className="section-info-header">
                    <h3>Costos del Cultivo</h3>
                    {isSelectedCultivoActivo && (
                      <button type="button" className="btn-add btn-primary" onClick={() => handleOpenDynamicModal(MODAL_TYPES.COSTO)}>
                        + Agregar Nuevo Costo
                      </button>
                    )}
                  </div>
                  <div className="search-filter-wrapper">
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por etapa:</label>
                      <select
                        className="filter-select filter-etapa-cultivo"
                        value={costoFilterEtapa}
                        onChange={(e) => setCostoFilterEtapa(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {costoEtapaOptions.map((etapa) => (
                          <option key={etapa.value} value={etapa.value}>
                            {etapa.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por categoría:</label>
                      <select
                        className="filter-select filter-categoria-cultivo"
                        value={costoFilterCategoria}
                        onChange={(e) => setCostoFilterCategoria(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {costoCategoriaOptions.map((categoria) => (
                          <option key={categoria.id} value={categoria.nombre}>
                            {categoria.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Estado de pago:</label>
                      <select
                        className="filter-select filter-estado-pago-cultivo"
                        value={costoFilterEstadoPago}
                        onChange={(e) => setCostoFilterEstadoPago(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {costoEstadoPagoOptions.map((estado) => (
                          <option key={estado.id} value={estado.nombre}>
                            {estado.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-wrapper" style={{ width: '100%' }}>
                      <label className="filter-label">Rango de fechas:</label>
                      <div className="date-range">
                        <input
                          type="date"
                          className="filter-date filter-fecha-desde-cultivo"
                          value={costoFilterFechaDesde}
                          onChange={(e) => setCostoFilterFechaDesde(e.target.value)}
                        />
                        <span className="date-separator">-</span>
                        <input
                          type="date"
                          className="filter-date filter-fecha-hasta-cultivo"
                          value={costoFilterFechaHasta}
                          onChange={(e) => setCostoFilterFechaHasta(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="totales-bar">
                    <span className="total-item">
                      Total: <strong id="total-costos">{Agro.formatCOP(costosDetalleTotales.total)}</strong>
                    </span>
                    <span className="total-item">
                      Registros: <strong id="total-registros">{costosDetalleTotales.count}</strong>
                    </span>
                  </div>

                  <StateFilterMenu
                    states={[ 'ACTIVO', 'ANULADO' ]}
                    activeState={detalleCostosEstado}
                    onStateChange={(s) => setDetalleCostosEstado(s)}
                    labels={{ ACTIVO: 'ACTIVOS', ANULADO: 'ANULADOS' }}
                  />
                  <div className="table-container">
                    <table className="data-table costos-table">
                      <thead>
                        <tr className="table-title-row">
                          <th colSpan={detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo ? 9 : 8}>Costos Registrados del Cultivo</th>
                        </tr>
                        <tr>
                          <th>Fecha</th>
                          <th>Usuario</th>
                          <th>Categoría</th>
                          <th>Subcategoría</th>
                          <th>Etapa</th>
                          <th>Info Adicional</th>
                          <th>Valor</th>
                          <th>Estado</th>
                          {detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingDetalleCostos ? (
                          <tr>
                            <td colSpan={detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo ? 9 : 8} style={{ textAlign: 'center', padding: '20px' }}>
                              Cargando costos del cultivo...
                            </td>
                          </tr>
                        ) : detallesCostosOrdenados.length === 0 ? (
                          <tr>
                            <td colSpan={detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo ? 9 : 8} style={{ textAlign: 'center', padding: '20px' }}>
                              No se encontraron registros asociados.
                            </td>
                          </tr>
                        ) : visibleCostos.length === 0 ? (
                          <tr>
                            <td colSpan={detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo ? 9 : 8} style={{ textAlign: 'center', padding: '20px' }}>
                              No se encontraron costos con los filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          visibleCostos.map((costo, i) => {
                            const isMp = costo.categoria === 'Materia Prima'
                            const pagoEstado = costo.estado_pago || costo.estado || 'Pendiente'
                            const estadoLower = String(pagoEstado || 'pendiente').toLowerCase().replace(/\s+/g, '-')
                            const estadoLabel = String(pagoEstado || 'Pendiente').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
                            const parseMonetaryString = (s) => {
                              if (s == null) return NaN
                              let str = String(s).trim()
                              // keep digits, dots, commas, minus
                              str = str.replace(/[^0-9.,-]/g, '')
                              if (str.indexOf('.') !== -1 && str.indexOf(',') !== -1) {
                                // assume format like 6.000,00 -> remove thousand dots, convert comma to dot
                                str = str.replace(/\./g, '').replace(/,/g, '.')
                              } else if (str.indexOf(',') !== -1) {
                                // assume comma is decimal separator
                                str = str.replace(/,/g, '.')
                              }
                              const n = Number(str)
                              return Number.isFinite(n) ? n : NaN
                            }

                            let valorNum = null
                            if (typeof costo.valor === 'number') {
                              valorNum = costo.valor
                            } else if (typeof costo.valor === 'string') {
                              const parsed = parseMonetaryString(costo.valor)
                              if (!Number.isNaN(parsed)) valorNum = parsed
                            }
                            const valorTexto = valorNum != null ? Agro.formatCOP(valorNum) : (costo.valor || '--')
                            return (
                              <tr
                                key={costo.id || i}
                                className={`data-item ${isMp ? 'clickeable-materia-prima' : ''}`}
                                style={{ cursor: isMp ? 'pointer' : undefined }}
                                onClick={(e) => {
                                  if (!isMp) return
                                  if (e.target.closest('.action-buttons')) return
                                  setElementosCultivo({ open: true, rows: getInventarioElementos(costo.descripcion, 'cultivo') })
                                  setTimeout(
                                    () => document.getElementById('elementos-inventario-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                    100,
                                  )
                                }}
                              >
                                <td data-field="fecha">{formatDateValue(costo.fecha)}</td>
                                <td data-field="usuario">{costo.usuario || '--'}</td>
                                <td data-field="categoria">
                                  {(() => {
                                    const rawCat = costo.categoria || 'Sin categoría'
                                    const norm = normalizeKey(rawCat)

                                    let catClass = 'cat-costos-indirectos'

                                    if (norm.includes('mano')) {
                                      catClass = 'cat-mano-obra'
                                    } else if (norm.includes('materia')) {
                                      catClass = 'cat-materia-prima'
                                    } else if (norm.includes('servicio')) {
                                      catClass = 'cat-servicios'
                                    } else if (norm.includes('indirect')) {
                                      catClass = 'cat-costos-indirectos'
                                    }

                                    return (
                                      <span className={`detalle-cultivo-badge-categoria ${catClass}`}>
                                        {rawCat}
                                      </span>
                                    )
                                  })()}
                                </td>
                                <td data-field="subcategoria">
                                  {(() => {
                                    const norm = normalizeKey(costo.categoria || '')

                                    let subCatClass = 'sub-cat-costos-indirectos'

                                    if (norm.includes('mano')) {
                                      subCatClass = 'sub-cat-mano-obra'
                                    } else if (norm.includes('materia')) {
                                      subCatClass = 'sub-cat-materia-prima'
                                    } else if (norm.includes('servicio')) {
                                      subCatClass = 'sub-cat-servicios'
                                    } else if (norm.includes('indirect')) {
                                      subCatClass = 'sub-cat-costos-indirectos'
                                    }

                                    return (
                                      <span className={`detalle-cultivo-badge-subcategoria ${subCatClass}`}>
                                        {costo.subcategoria || '--'}
                                      </span>
                                    )
                                  })()}
                                </td>

                                <td data-field="etapa">
                                  <span className="detalle-cultivo-badge-etapa">
                                    {costo.etapa || '--'}
                                  </span>
                                </td>
                                <td data-field="descripcion">{costo.descripcion || '--'}</td>
                                <td data-field="valor">{valorTexto}</td>
                                <td data-field="estado">
                                  <span className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${estadoLower}`}>
                                    {estadoLabel}
                                  </span>
                                </td>
                                {detalleCostosEstado === 'ACTIVO' && isSelectedCultivoActivo && (
                                  <td data-field="acciones">
                                    <div className="action-buttons">
                                      <button
                                        type="button"
                                        className="btn-icon btn-edit"
                                        title="Editar"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenEditCosto(costo)
                                        }}
                                      >
                                        {'\u270F\uFE0F'}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-icon btn-delete"
                                        title="Anular"
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          await handleDeleteCosto(costo)
                                        }}
                                      >
                                        {'\uD83D\uDEAB'}
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="info-section" id="elementos-inventario-section" style={{ display: elementosCultivo.open ? 'block' : 'none' }}>
                  <div className="section-info-header">
                    <h3>Información del Inventario </h3>
                    <button type="button" className="btn-close-elements" id="btn-close-elements" onClick={() => setElementosCultivo({ open: false, rows: [] })}>
                      ✕ Cerrar
                    </button>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr className="table-title-row">
                          <th colSpan={5}>Elementos usados del inventario</th>
                        </tr>
                        <tr>
                          <th>Producto</th>
                          <th>Precio Producto</th>
                          <th>Cantidad Usada</th>
                          <th>Medida Usada</th>
                          <th>Costo Total</th>
                        </tr>
                      </thead>
                      <tbody id="elementos-inventario-tbody">
                        {elementosCultivo.rows.map((el, idx) => (
                          <tr key={idx} className="data-item">
                            <td data-field="producto">{el.producto}</td>
                            <td data-field="precio">{el.precioFmt}</td>
                            <td data-field="cantidad">{el.cantidad}</td>
                            <td data-field="medida">{el.medida}</td>
                            <td data-field="costo-total">{el.totalFmt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </section>

          {/* Sección de reportes: filtros, selección de tipo y exportación. */}
          <section id="reportes-section" className={`content-section ${activeSection === 'reportes' ? 'active' : ''}`}>
            <div className="reportes-container">
              <div className="reportes-header">
                <h2>Módulo de Reportes</h2>
                <p>Genera reportes completos y exportables del sistema</p>
              </div>
              <div className="filtros-section">
                <h3>Filtros</h3>
                <div className="filtros-grid">
                  <div className="filtro-group">
                    <label>Rango de Fechas</label>
                    <input type="date" id="filtroFechaInicio" className="filtro-input" value={filtroFechaInicio} onChange={(e) => setFiltroFechaInicio(e.target.value)} />
                    <input type="date" id="filtroFechaFin" className="filtro-input" value={filtroFechaFin} onChange={(e) => setFiltroFechaFin(e.target.value)} />
                  </div>
                  <div className="filtro-group">
                    <label>Cultivo</label>
                    <select id="filtroCultivo" className="filtro-select" value={filtroCultivo} onChange={(e) => setFiltroCultivo(e.target.value)}>
                      <option value="">Todos los cultivos</option>
                      {filterOptions.cultivos.map((cultivo) => (
                        <option key={cultivo.id} value={cultivo.id}>
                          {cultivo.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filtro-group">
                    <label>Categoría de Costo</label>
                    <select id="filtroCategoriaCosto" className="filtro-select" value={filtroCategoriaCosto} disabled={reportType === 'produccion'} onChange={(e) => {
                      setFiltroCategoriaCosto(e.target.value)
                      setFiltroSubcategoriaCosto('')
                    }}>
                      <option value="">Todas las categorías</option>
                      {filterOptions.categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filtro-group">
                    <label>Subcategoría de Costo</label>
                    <select
                      id="filtroSubcategoriaCosto"
                      className="filtro-select"
                      value={filtroSubcategoriaCosto}
                      disabled={!filtroCategoriaCosto || reportType === 'produccion'}
                      onChange={(e) => setFiltroSubcategoriaCosto(e.target.value)}
                    >
                      <option value="">Todas las subcategorías</option>
                      {filterOptions.subcategorias
                        .filter((subcategoria) => String(subcategoria.categoriaId) === String(filtroCategoriaCosto))
                        .map((subcategoria) => (
                          <option key={subcategoria.id} value={subcategoria.id}>
                            {subcategoria.nombre}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="filtro-group">
                    <label>Usuario</label>
                    <select id="filtroUsuario" className="filtro-select" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
                      <option value="">Todos los usuarios</option>
                      {filterOptions.usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nombre} {usuario.apellidos}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filtro-group">
                    <label>Estado del Cultivo</label>
                    <select id="filtroEstadoCultivo" className="filtro-select" value={filtroEstadoCultivo} onChange={(e) => setFiltroEstadoCultivo(e.target.value)}>
                      <option value="">Todos los estados</option>
                      {filterOptions.estados.map((estado) => (
                        <option key={estado.id} value={estado.id}>
                          {estado.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filtro-group">
                    <button
                      type="button"
                      id="btnAplicarFiltros"
                      className="btn-primary"
                      onClick={async () => {
                        if (!reportType) {
                          showNotification('Selecciona primero un tipo de reporte', 'error')
                          return
                        }
                        await fetchReport(reportType)
                        showNotification('Filtros aplicados', 'info')
                      }}
                    >
                      Aplicar Filtros
                    </button>
                    <button
                      type="button"
                      id="btnLimpiarFiltros"
                      className="btn-secondary"
                      onClick={() => {
                        setFiltroFechaInicio('')
                        setFiltroFechaFin('')
                        setFiltroCultivo('')
                        setFiltroCategoriaCosto('')
                        setFiltroSubcategoriaCosto('')
                        setFiltroUsuario('')
                        setFiltroEstadoCultivo('')
                        setReportData(null)
                        setReportMessage(null)
                        showNotification('Filtros limpiados', 'info')
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              </div>
              <div className="reportes-tipos">
                <h3>Selecciona un tipo de reporte</h3>
                <div className="reportes-botones">
                  {[
                    { tipo: 'por-cultivo', icon: '🌱', label: 'Reporte por Cultivo' },
                    { tipo: 'costos', icon: '💸', label: 'Reporte de Costos' },
                    { tipo: 'produccion', icon: '🌾', label: 'Reporte de Producción' },
                    { tipo: 'rentabilidad', icon: '📈', label: 'Reporte de Rentabilidad' },
                    { tipo: 'trabajador', icon: '👷', label: 'Reporte por Trabajador' },
                  ].map((b) => (
                    <button key={b.tipo} type="button" className="btn-reporte" data-reporte={b.tipo} onClick={() => openReport(b.tipo)}>
                      <span className="icon">{b.icon}</span>
                      <span>{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div
                id="reporteContenedor"
                className="reporte-contenedor"
                style={{ display: reportVisible ? 'block' : 'none' }}
                data-last-reporte={reportType || ''}
              >
                {reportVisible && reportType ? (
                  <>
                    {isLoadingReport ? (
                      <div style={{ padding: 20 }}>Cargando reporte...</div>
                    ) : reportMessage ? (
                      <div style={{ padding: 20 }}>{reportMessage}</div>
                    ) : (
                      <AdminReportTable fincaId={fincaId} reportType={reportType} reportData={reportData} />
                    )}
                    <div className="reporte-exportar">
                      <button type="button" className="btn-exportar pdf" disabled={isLoadingReport || !Array.isArray(reportData)} onClick={() => exportReport('PDF')}>
                        Exportar PDF
                      </button>
                      <button type="button" className="btn-exportar excel" disabled={isLoadingReport || !Array.isArray(reportData)} onClick={() => exportReport('Excel')}>
                        Exportar Excel
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          {/* Sección de costos generales: lista de costos y detalle de inventario. */}
          <section id="costos-section" className={`content-section ${activeSection === 'costos' ? 'active' : ''}`}>
            <div className="search-filter-wrapper">
              <div className="filter-wrapper">
                <label className="filter-label">Filtrar por categoría:</label>
                <select
                  className="filter-select"
                  value={generalCostoFilterCategoria}
                  onChange={(e) => setGeneralCostoFilterCategoria(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {costoCategoriaOptions.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-wrapper">
                <label className="filter-label">Filtrar por cultivo:</label>
                <select
                  className="filter-select"
                  value={generalCostoFilterCultivo}
                  onChange={(e) => setGeneralCostoFilterCultivo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {cultivos
                    .map((cultivo) => cultivo?.nombre)
                    .filter(Boolean)
                    .map((nombre) => ({ value: nombre, label: nombre }))
                    .filter((item, index, self) => self.findIndex((other) => other.value === item.value) === index)
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="filter-wrapper">
                <label className="filter-label">Filtrar por usuario:</label>
                <select
                  className="filter-select"
                  value={generalCostoFilterUsuario}
                  onChange={(e) => setGeneralCostoFilterUsuario(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {users
                    .map((usuario) => `${usuario.nombre || ''} ${usuario.apellidos || ''}`.trim())
                    .filter(Boolean)
                    .map((nombre) => ({ value: nombre, label: nombre }))
                    .filter((item, index, self) => self.findIndex((other) => other.value === item.value) === index)
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="filter-wrapper">
                <label className="filter-label">Estado de pago:</label>
                <select
                  className="filter-select"
                  value={generalCostoFilterEstadoPago}
                  onChange={(e) => setGeneralCostoFilterEstadoPago(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
              </div>
              <div className="filter-wrapper">
                <label className="filter-label">Rango de fechas:</label>
                <div className="date-range">
                  <input
                    type="date"
                    className="filter-date"
                    value={generalCostoFilterFechaDesde}
                    onChange={(e) => setGeneralCostoFilterFechaDesde(e.target.value)}
                  />
                  <span className="date-separator">-</span>
                  <input
                    type="date"
                    className="filter-date"
                    value={generalCostoFilterFechaHasta}
                    onChange={(e) => setGeneralCostoFilterFechaHasta(e.target.value)}
                  />
                </div>
              </div>
              <button type="button" className="btn-add btn-primary" onClick={() => handleOpenDynamicModal(MODAL_TYPES.COSTO)}>
                + Agregar Nuevo Costo
              </button>
            </div>
            <div className="totales-bar">
              <div className="total-item">
                <span>Costos visibles:</span>
                <strong>{costosGeneralesTotales.count}</strong>
              </div>
              <div className="total-item">
                <span>Valor total:</span>
                <strong>{formatPrecioValue(costosGeneralesTotales.total)}</strong>
              </div>
            </div>
            <StateFilterMenu
              states={[ 'ACTIVO', 'ANULADO' ]}
              activeState={costosGeneralesEstado}
              onStateChange={(s) => setCostosGeneralesEstado(s)}
              labels={{ ACTIVO: 'ACTIVO', ANULADO: 'ANULADO' }}
            />
            <div className="table-container">
              <table className="data-table costos-generales-table">
                <thead>
                  <tr className="table-title-row">
                    <th colSpan={9}>Costos Generales de la Finca</th>
                  </tr>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Categoría</th>
                    <th>Subcategoría</th>
                    <th>Cultivo</th>
                    <th>Descripción</th>
                    <th>Valor</th>
                    <th>Estado de Pago</th>
                    {costosGeneralesEstado === 'ACTIVO' && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {isLoadingCostosGenerales ? (
                    <tr className="data-item">
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px' }}>
                        Cargando costos generales...
                      </td>
                    </tr>
                  ) : visibleCostosGenerales.length ? (
                    visibleCostosGenerales.map((costo) => {
                      const isMp = String(costo.categoria || '').toLowerCase() === 'materia prima'
                      const categoryKey = normalizeKey(costo.categoria || 'sin subcategoria').replace(/\s+/g, '-')
                      const subcategoryKey = normalizeKey(costo.subcategoria || 'sin subcategoria').replace(/\s+/g, '-')
                      const categoriaClass = `cg-badge-categoria cat-${categoryKey}`
                      const subcategoriaClass = `cg-badge-subcategoria sub-cat-${subcategoryKey}`
                      const estadoClass = `status-badge status-${normalizeKey(costo.estado_pago || '').replace(/\s+/g, '-')}`
                      const cultivoClass = 'cg-badge-cultivo'

                      return (
                        <tr
                          key={costo.id}
                          className={`data-item ${isMp ? 'clickeable-materia-prima' : ''}`}
                          style={{ cursor: isMp ? 'pointer' : undefined }}
                          onClick={(e) => {
                            if (!isMp) return
                            if (e.target.closest('.action-buttons')) return
                            setElementosGenerales({ open: true, rows: getInventarioElementos(costo.descripcion, 'generales') })
                            setTimeout(
                              () => document.getElementById('elementos-inventario-generales-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                              100,
                            )
                          }}
                        >
                          <td data-field="fecha">{formatDateValue(costo.fecha)}</td>
                          <td data-field="usuario">{costo.usuario || '--'}</td>
                          <td data-field="categoria">
                            <span className={categoriaClass}>{costo.categoria || '--'}</span>
                          </td>
                          <td data-field="subcategoria">
                            <span className={subcategoriaClass}>{costo.subcategoria || 'Sin subcategoría'}</span>
                          </td>
                          <td data-field="cultivo">
                            <span className={cultivoClass}>{capitalizeWords(costo.cultivo || 'General')}</span>
                          </td>
                          <td data-field="descripcion">{costo.descripcion || '--'}</td>
                          <td data-field="valor">{formatPrecioValue(costo.valor)}</td>
                          <td data-field="estado_pago">
                            <span className={estadoClass}>{costo.estado_pago || '--'}</span>
                          </td>
                          {costosGeneralesEstado === 'ACTIVO' && (
                            <td data-field="acciones">
                              <div className="action-buttons">
                                <button type="button" className="btn-icon btn-edit" title="Editar" onClick={(event) => {
                                  event.stopPropagation()
                                  handleOpenEditCosto(costo)
                                }}>
                                  {'\u270F\uFE0F'}
                                </button>
                                <button type="button" className="btn-icon btn-delete" title="Anular" onClick={(event) => {
                                  event.stopPropagation()
                                  handleDeleteCosto(costo)
                                }}>
                                  {'\uD83D\uDEAB'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  ) : (
                    <tr className="data-item">
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px' }}>
                        No se encontraron registros asociados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="info-section" id="elementos-inventario-generales-section" style={{ display: elementosGenerales.open ? 'block' : 'none' }}>
              <div className="section-info-header">
                <h3>Información del Inventario</h3>
                <button
                  type="button"
                  className="btn-close-elements"
                  id="btn-close-elements-generales"
                  onClick={() => setElementosGenerales({ open: false, rows: [] })}
                >
                  ✕ Cerrar
                </button>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr className="table-title-row">
                      <th colSpan={5}>Elementos usados del inventario</th>
                    </tr>
                    <tr>
                      <th>Producto</th>
                      <th>Precio Producto</th>
                      <th>Cantidad Usada</th>
                      <th>Medida Usada</th>
                      <th>Costo Total</th>
                    </tr>
                  </thead>
                  <tbody id="elementos-inventario-generales-tbody">
                    {elementosGenerales.rows.map((el, idx) => (
                      <tr key={idx} className="data-item">
                        <td data-field="producto">{el.producto}</td>
                        <td data-field="precio">{el.precioFmt}</td>
                        <td data-field="cantidad">{el.cantidad}</td>
                        <td data-field="medida">{el.medida}</td>
                        <td data-field="costo-total">{el.totalFmt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Sección de rentabilidad: gráficos comparativos y tabla de márgenes. */}
          <section id="configuracion-section" className={`content-section ${activeSection === 'configuracion' ? 'active' : ''}`}>
            <div className="section-header">
              <h2>Configuración</h2>
            </div>

            <div className="config-section">
              <div className="config-card">
                <div>
                  <h3>Modo Oscuro</h3>
                  <p>Activa el tema oscuro en toda la aplicación administrativa.</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={darkModeEnabled}
                    onChange={() => setDarkModeEnabled((prev) => !prev)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section id="rentabilidad-section" className={`content-section ${activeSection === 'rentabilidad' ? 'active' : ''}`}>
            <div className="section-header">
              <h2>Análisis de Rentabilidad</h2>
            </div>
            {!isValidFincaId(fincaId) ? (
              <div className="dashboard-error" role="status">Selecciona una finca válida para consultar su rentabilidad.</div>
            ) : isLoadingDashboard ? (
              <div className="dashboard-loading" role="status">Cargando análisis de rentabilidad...</div>
            ) : dashboardError ? (
              <div className="dashboard-error" role="alert">{dashboardError}</div>
            ) : !dashboardData ? (
              <div className="dashboard-empty" role="status">No se recibieron datos del dashboard.</div>
            ) : rentabilidadRows.length === 0 ? (
              <div className="dashboard-empty" role="status">No hay datos de costos o ingresos para analizar en esta finca.</div>
            ) : (
              <div className="reporte-resumen">
                <div className="resumen-item">
                  <label>Ingresos</label>
                  <div className="valor">{Agro.formatCOP(rentabilidadTotals.totalIngresos)}</div>
                </div>
                <div className="resumen-item">
                  <label>Costos</label>
                  <div className="valor">{Agro.formatCOP(rentabilidadTotals.totalCosto)}</div>
                </div>
                <div className="resumen-item">
                  <label>Ganancia</label>
                  <div className="valor">{Agro.formatCOP(rentabilidadTotals.totalGanancia)}</div>
                </div>
                <div className="resumen-item">
                  <label>Margen</label>
                  <div className="valor">{rentabilidadTotals.margen.toFixed(1)}%</div>
                </div>
              </div>
            )}
            <div className="charts-grid" hidden={!dashboardData || isLoadingDashboard || Boolean(dashboardError) || rentabilidadRows.length === 0}>
              <div className="chart-card">
                <h3>Rentabilidad por Cultivo (%)</h3>
                <div className="chart-wrapper">
                  <canvas ref={crdRef} id="chartRentabilidadDetallada" />
                </div>
              </div>
              <div className="chart-card">
                <h3>Comparación: Ingresos vs Costos</h3>
                <div className="chart-wrapper">
                  <canvas ref={cicRef} id="chartComparativaIngresosCostos" />
                </div>
              </div>
            </div>
            <div className="table-container" hidden={!isValidFincaId(fincaId) || isLoadingDashboard || Boolean(dashboardError) || !dashboardData}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cultivo</th>
                    <th>Ingresos</th>
                    <th>Costos</th>
                    <th>Ganancia</th>
                    <th>Margen (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {rentabilidadRows.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin datos de rentabilidad</td></tr>
                  ) : rentabilidadRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.nombre || '--'}</td>
                      <td>{Agro.formatCOP(r.ingresos)}</td>
                      <td>{Agro.formatCOP(r.costo)}</td>
                      <td>{Agro.formatCOP(r.ganancia)}</td>
                      <td>{Number(r.margen || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
      <ReasonModal
        isOpen={reasonModal.isOpen}
        title={reasonModal.title}
        question={reasonModal.question}
        onConfirm={reasonModal.callback || (() => {})}
        onCancel={reasonModal.cancelCallback || (() => setReasonModal((r) => ({ ...r, isOpen: false })))}
      />
    </div>
  )
}