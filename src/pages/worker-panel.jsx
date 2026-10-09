import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import * as Agro from '../services/agroData'
import { clearTokens } from '../services/authSession'
import { logoutUser } from '../services/authApi'
import useAuthSession from '../hooks/useAuthSession'
import { getInventarioElementos } from '../utils/inventarioElementos'
import { MODAL_TYPES } from '../utils/modalConfig'
import { DynamicModal } from '../components/DynamicModal'
import ReasonModal from '../components/ReasonModal'
import { StateFilterMenu } from '../components/StateFilters'
import { fetchFincasPorUsuario, fetchCultivosPorUsuario } from '../services/asignaciones-usuarioAPI'
import {
  fetchCultivoDetalle,
  fetchCategoriasCosto,
  fetchSubcategoriasPorCategoria,
  fetchEstadosPago,
  fetchUnidadesMedida,
  fetchTiposPrecio,
  fetchEtapaEnProcesoPorCultivo,
  fetchEtapasPorCultivo,
  fetchAllEtapasCatalog,
  fetchEstados,
  createEtapaForCultivo,
  updateEtapaForCultivo,
  deleteEtapaForCultivo,
  validateCultivoForCost,
  createCosto,
  updateCosto,
  deleteCosto,
  fetchCosechasPorCultivo,
  createCosecha,
  updateCosecha,
  deleteCosecha,
  changeEtapaState,
  changeCostoState,
  changeCosechaState,
} from '../services/cultivoService'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import '../styles/admin-panel.css'
import '../styles/worker-panel.css'

const SECTION_TITLES = { inicio: 'Inicio', cultivos: 'Mis Cultivos' }
const WORKER_SELECTED_FINCA_KEY = 'workerSelectedFincaId'

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

function parseDateString(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const str = String(value || '').trim()
  if (!str) return null

  if (str.includes('T') || str.includes('-')) {
    const date = new Date(str)
    if (!Number.isNaN(date.getTime())) return date
  }

  if (str.includes('/')) {
    const parts = str.split('/').map((part) => part.trim())
    if (parts.length === 3) {
      const [first, second, third] = parts
      if (first.length === 4) {
        const date = new Date(Number(first), Number(second) - 1, Number(third))
        if (!Number.isNaN(date.getTime())) return date
      }
      const date = new Date(Number(third), Number(second) - 1, Number(first))
      if (!Number.isNaN(date.getTime())) return date
    }
  }

  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateDisplay(value) {
  const date = parseDateString(value)
  return date ? date.toISOString().slice(0, 10) : '--'
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

function normalizeSelectValue(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'object') {
    return String(value.id ?? value.value ?? '')
  }
  return String(value)
}

function getCosechaSelectId(cosecha, keys) {
  if (!cosecha || typeof cosecha !== 'object') return ''
  for (const key of keys) {
    const value = cosecha[key]
    if (value != null && value !== '') {
      return normalizeSelectValue(value)
    }
  }
  return ''
}

function formatMoneyDisplay(value) {
  if (value == null || String(value).trim() === '') return '--'
  const amount = parseMoneyValue(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
    : '--'
}

function normEtapaKey(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ /g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const WORKER_SELECTED_CULTIVO_KEY = 'workerSelectedCultivoId'

function normalizeStateValue(value) {
  return normEtapaKey(String(value || ''))
}

function getRegistroEstado(item) {
  if (!item || typeof item !== 'object') return null
  const raw = item.estado_registro ?? item.estadoRegistro
  return raw != null ? String(raw).trim().toUpperCase() : null
}

export default function WorkerPanel() {
  const navigate = useNavigate()
  const session = useAuthSession()

  const worker = useMemo(() => {
    if (!session || session.role !== 'worker') return null

    if (session.workerKey) {
      const foundByKey = Agro.getTrabajadorByKey(session.workerKey)
      if (foundByKey) return foundByKey
    }

    if (session.email) {
      const foundByEmail = Agro.getTrabajadorByEmail(session.email)
      if (foundByEmail) return foundByEmail
    }

    return {
      id: session.id,
      nombre: session.nombre,
      apellidos: session.apellidos || '',
      email: session.email,
    }
  }, [session])

  const [activeSection, setActiveSection] = useState(() => localStorage.getItem('workerActiveSection') || 'inicio')
  const [fincaId, setFincaId] = useState(() => localStorage.getItem(WORKER_SELECTED_FINCA_KEY) || '')
  const [pageTitle, setPageTitle] = useState(() => {
    const section = localStorage.getItem('workerActiveSection') || 'inicio'
    return section === 'inicio' ? 'Inicio - Mi panel' : SECTION_TITLES[section] || 'Inicio - Mi panel'
  })
  const [selectedCultivo, setSelectedCultivo] = useState(null)

  const [filterCat, setFilterCat] = useState('todos')
  const [filterEtapa, setFilterEtapa] = useState('todos')
  const [filterDesde, setFilterDesde] = useState('')
  const [filterHasta, setFilterHasta] = useState('')

  const [searchCultivoTerm, setSearchCultivoTerm] = useState('')
  const [filterEstadoCultivo, setFilterEstadoCultivo] = useState('todos')
  const [searchEtapaTerm, setSearchEtapaTerm] = useState('')
  const [filterEtapaEstado, setFilterEtapaEstado] = useState('todos')
  const [cosechaFilterFechaDesde, setCosechaFilterFechaDesde] = useState('')
  const [cosechaFilterFechaHasta, setCosechaFilterFechaHasta] = useState('')
  const [filterEstadoPago, setFilterEstadoPago] = useState('todos')
  
  // Estado para menús de detalle (etapas, cosechas, costos)
  const [etapasEstado, setEtapasEstado] = useState('ACTIVO')
  const [detalleCostosEstado, setDetalleCostosEstado] = useState('ACTIVO')
  const [detalleCosechasEstado, setDetalleCosechasEstado] = useState('ACTIVO')

  const [showDynamicModal, setShowDynamicModal] = useState(false)
  const [dynamicModalType, setDynamicModalType] = useState(null)
  const [modalFieldOptions, setModalFieldOptions] = useState({})
  const [modalInitialData, setModalInitialData] = useState(undefined)
  const [editingEtapa, setEditingEtapa] = useState(null)
  const [reasonModal, setReasonModal] = useState({
    isOpen: false,
    title: '',
    question: '',
    callback: null,
    cancelCallback: null,
  })
  const [editingCosecha, setEditingCosecha] = useState(null)
  const [editingCosto, setEditingCosto] = useState(null)
  const [activeCostoEtapaId, setActiveCostoEtapaId] = useState(null)
  const [etapasCultivo, setEtapasCultivo] = useState([])
  const [detalleCosechas, setDetalleCosechas] = useState([])
  const [detalleCostos, setDetalleCostos] = useState([])
  const [isLoadingEtapas, setIsLoadingEtapas] = useState(false)
  const [isLoadingCosechas, setIsLoadingCosechas] = useState(false)
  const [isLoadingCostos, setIsLoadingCostos] = useState(false)
  const [isSavingEtapa, setIsSavingEtapa] = useState(false)
  const [isSavingCosecha, setIsSavingCosecha] = useState(false)
  const [isSavingCosto, setIsSavingCosto] = useState(false)
  const [cosechaUnidadOptions, setCosechaUnidadOptions] = useState([])
  const [cosechaTipoPrecioOptions, setCosechaTipoPrecioOptions] = useState([])
  const [costoCategoriaOptions, setCostoCategoriaOptions] = useState([])
  const [costoEstadoPagoOptions, setCostoEstadoPagoOptions] = useState([])

  const [elementosOpen, setElementosOpen] = useState(false)
  const [elementosRows, setElementosRows] = useState([])
  const [usuarioFincas, setUsuarioFincas] = useState([])
  const [isLoadingFincas, setIsLoadingFincas] = useState(true)
  const [fincasError, setFincasError] = useState('')

  const fincasAsignadas = useMemo(() => {
    return usuarioFincas.filter((finca) => getRegistroEstado(finca) === 'ACTIVO')
  }, [usuarioFincas])

  const [cultivosFinca, setCultivosFinca] = useState([])
  const [isLoadingCultivosFinca, setIsLoadingCultivosFinca] = useState(false)

  useEffect(() => {
    if (!session || session.role !== 'worker') {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  useEffect(() => {
    const loadFincas = async () => {
      if (!worker) {
        setUsuarioFincas([])
        setFincasError('')
        setIsLoadingFincas(false)
        return
      }
      try {
        setIsLoadingFincas(true)
        setFincasError('')
        const response = await fetchFincasPorUsuario()
        if (!response?.success || !Array.isArray(response.data)) {
          setUsuarioFincas([])
          setFincasError(response?.message || 'No se pudieron cargar tus fincas asignadas.')
          return
        }
        setUsuarioFincas(response.data)
      } catch (error) {
        console.error('Error cargando fincas del trabajador:', error)
        setUsuarioFincas([])
        setFincasError('No se pudieron cargar tus fincas asignadas.')
      } finally {
        setIsLoadingFincas(false)
      }
    }

    loadFincas()
  }, [worker])

  const validFincaId = useMemo(() => {
    if (!worker || fincasAsignadas.length === 0) return ''
    const selectedFincaId = Number(fincaId)
    if (selectedFincaId && fincasAsignadas.some((f) => Number(f.id) === selectedFincaId)) return selectedFincaId
    return Number(fincasAsignadas[0].id)
  }, [worker, fincasAsignadas, fincaId])

  useEffect(() => {
    if (!validFincaId) return
    localStorage.setItem(WORKER_SELECTED_FINCA_KEY, String(validFincaId))
  }, [validFincaId])

  useEffect(() => {
    const load = async () => {
      if (!worker || !validFincaId) {
        setCultivosFinca([])
        return
      }
      try {
        setIsLoadingCultivosFinca(true)
        const res = await fetchCultivosPorUsuario(validFincaId)
        const list = res?.success ? res.data : (Array.isArray(res) ? res : [])
        setCultivosFinca(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error('Error cargando cultivos del trabajador:', e)
        setCultivosFinca([])
      } finally {
        setIsLoadingCultivosFinca(false)
      }
    }

    load()
  }, [worker, validFincaId])

  useEffect(() => {
    if (activeSection !== 'detalle-cultivo' || selectedCultivo) return
    const storedCultivoId = localStorage.getItem(WORKER_SELECTED_CULTIVO_KEY)
    if (!storedCultivoId) return
    const cultivoId = Number(storedCultivoId)
    if (!cultivoId || !Array.isArray(cultivosFinca) || cultivosFinca.length === 0) return
    const savedCultivo = cultivosFinca.find((cultivo) => Number(cultivo.id) === cultivoId)
    if (savedCultivo) {
      setSelectedCultivo(savedCultivo)
      setPageTitle(`Detalle del Cultivo: ${savedCultivo.nombre}`)
    }
  }, [activeSection, cultivosFinca, selectedCultivo])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [categoriasResponse, estadosPagoResponse, unidadesResponse, tiposPrecioResponse] = await Promise.all([
          fetchCategoriasCosto(),
          fetchEstadosPago(),
          fetchUnidadesMedida(),
          fetchTiposPrecio(),
        ])

        const categoriasArray = Array.isArray(categoriasResponse)
          ? categoriasResponse
          : categoriasResponse?.data || []
        const estadosPagoArray = Array.isArray(estadosPagoResponse)
          ? estadosPagoResponse
          : estadosPagoResponse?.data || []
        const unidadesArray = Array.isArray(unidadesResponse)
          ? unidadesResponse
          : unidadesResponse?.data || []
        const tiposPrecioArray = Array.isArray(tiposPrecioResponse)
          ? tiposPrecioResponse
          : tiposPrecioResponse?.data || []

        setCostoCategoriaOptions(categoriasArray)
        setCostoEstadoPagoOptions(estadosPagoArray)
        setCosechaUnidadOptions(unidadesArray)
        setCosechaTipoPrecioOptions(tiposPrecioArray)
      } catch (error) {
        console.error('Error cargando opciones iniciales:', error)
      }
    }

    loadOptions()
  }, [])

  useEffect(() => {
    const loadCultivoDetails = async () => {
      if (!selectedCultivo) {
        setEtapasCultivo([])
        setDetalleCosechas([])
        setDetalleCostos([])
        setIsLoadingEtapas(false)
        setIsLoadingCosechas(false)
        setIsLoadingCostos(false)
        return
      }

      const cultivoId = selectedCultivo.id

      try {
        setIsLoadingCostos(true)
        const detalle = await fetchCultivoDetalle(cultivoId)
        const costs = Array.isArray(detalle)
          ? detalle
          : detalle?.costos || detalle?.detalle || detalle?.detalleCostos || []
        setDetalleCostos(Array.isArray(costs) ? costs : [])
      } catch (error) {
        console.error('Error cargando costos del cultivo:', error)
        setDetalleCostos([])
      } finally {
        setIsLoadingCostos(false)
      }

      try {
        setIsLoadingEtapas(true)
        const etapas = await fetchEtapasPorCultivo(cultivoId)
        setEtapasCultivo(Array.isArray(etapas) ? sortEtapasForDisplay(etapas) : [])
      } catch (error) {
        console.error('Error cargando etapas del cultivo:', error)
        setEtapasCultivo([])
      } finally {
        setIsLoadingEtapas(false)
      }

      try {
        setIsLoadingCosechas(true)
        const cosechas = await fetchCosechasPorCultivo(cultivoId)
        setDetalleCosechas(Array.isArray(cosechas) ? cosechas : [])
      } catch (error) {
        console.error('Error cargando cosechas del cultivo:', error)
        setDetalleCosechas([])
      } finally {
        setIsLoadingCosechas(false)
      }
    }

    loadCultivoDetails()
  }, [selectedCultivo])

  const refreshCultivoDetalleData = async () => {
    if (!selectedCultivo) return
    const cultivoId = selectedCultivo.id

    try {
      setIsLoadingCostos(true)
      const detalle = await fetchCultivoDetalle(cultivoId)
      const costs = Array.isArray(detalle)
        ? detalle
        : detalle?.costos || detalle?.detalle || detalle?.detalleCostos || []
      setDetalleCostos(Array.isArray(costs) ? costs : [])
    } catch (error) {
      console.error('Error recargando costos del cultivo:', error)
      setDetalleCostos([])
    } finally {
      setIsLoadingCostos(false)
    }

    try {
      setIsLoadingEtapas(true)
      const etapas = await fetchEtapasPorCultivo(cultivoId)
      setEtapasCultivo(Array.isArray(etapas) ? sortEtapasForDisplay(etapas) : [])
    } catch (error) {
      console.error('Error recargando etapas del cultivo:', error)
      setEtapasCultivo([])
    } finally {
      setIsLoadingEtapas(false)
    }

    try {
      setIsLoadingCosechas(true)
      const cosechas = await fetchCosechasPorCultivo(cultivoId)
      setDetalleCosechas(Array.isArray(cosechas) ? cosechas : [])
    } catch (error) {
      console.error('Error recargando cosechas del cultivo:', error)
      setDetalleCosechas([])
    } finally {
      setIsLoadingCosechas(false)
    }
  }

  const showNotification = useCallback((message, type = 'info') => {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type,
      title: message,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
    })
  }, [])

  const sortEtapasForDisplay = (etapas = []) => {
    return [...etapas].sort((a, b) => {
      const dateA = parseDateString(a.fechaInicio || a.fecha_inicio || '')
      const dateB = parseDateString(b.fechaInicio || b.fecha_inicio || '')
      if (dateA && dateB) {
        return dateA - dateB
      }
      if (a.id != null && b.id != null) {
        return a.id - b.id
      }
      return 0
    })
  }

  const handleCloseModal = () => {
    setShowDynamicModal(false)
    setDynamicModalType(null)
    setModalInitialData(undefined)
    setModalFieldOptions({})
    setEditingEtapa(null)
    setEditingCosecha(null)
    setEditingCosto(null)
    setActiveCostoEtapaId(null)
  }

  const handleCostoFieldChange = useCallback(
    async (name, value) => {
      if (name === 'categoria') {
        try {
          const subcategoriasResponse = await fetchSubcategoriasPorCategoria(value)
          const subcategoriasArray = Array.isArray(subcategoriasResponse)
            ? subcategoriasResponse
            : subcategoriasResponse?.data || []
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

  const openAddEtapaModal = async () => {
    if (!selectedCultivo) {
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
      const list = await fetchAllEtapasCatalog()
      const etapasArr = Array.isArray(list) ? list : []
      setModalFieldOptions({
        idetapa: etapasArr.map((e) => ({ value: String(e.id), label: e.nombre })),
      })
      setModalInitialData({ idetapa: '', descripcion: '' })
      setDynamicModalType(MODAL_TYPES.ETAPA)
      setEditingEtapa(null)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error cargando catálogo de etapas:', error)
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
      const current = await fetchEtapaEnProcesoPorCultivo(selectedCultivo.id)
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

      const res = await createEtapaForCultivo(selectedCultivo.id, { idetapa, descripcion, forceFinalize })
      if (res && res.success) {
        showNotification('Etapa registrada correctamente', 'success')
        const updated = await fetchEtapasPorCultivo(selectedCultivo.id)
        setEtapasCultivo(Array.isArray(updated) ? sortEtapasForDisplay(updated) : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'Error creando etapa', 'error')
      }
    } catch (error) {
      console.error('Error creando etapa:', error)
      const message = error?.response?.data?.message || error?.message || 'Error creando etapa'
      showNotification(message, 'error')
    } finally {
      setIsSavingEtapa(false)
    }
  }

  const handleOpenEditEtapa = async (etapa) => {
    try {
      const list = await fetchAllEtapasCatalog()
      const etapasArr = Array.isArray(list) ? list : []
      const estadosResponse = await fetchEstados()
      const estadosArr = Array.isArray(estadosResponse)
        ? estadosResponse
        : estadosResponse?.data || []
      const estadosFiltrados = estadosArr.filter((e) => {
        const nombre = (e.nombre || '').toLowerCase()
        return nombre === 'en proceso' || nombre === 'finalizado'
      })

      const etapaCatalog = etapasArr.find((e) => e.nombre === etapa.nombre)
      const idetapaValue = etapaCatalog ? String(etapaCatalog.id) : String(etapa.idetapa || etapa.id || '')
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
        idestado: String(etapa.idestado || etapa.estadoId || ''),
      })
      setDynamicModalType(MODAL_TYPES.ETAPA)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando edición de etapa:', error)
      showNotification('Error al cargar datos de la etapa', 'error')
    }
  }

  const handleSubmitEditEtapa = async (formData) => {
    if (!editingEtapa) {
      showNotification('Error: No hay etapa seleccionada para editar', 'error')
      return
    }

    const idetapa = Number(String(formData.idetapa || '').trim())
    const idestado = Number(String(formData.idestado || '').trim())
    const descripcion = String(formData.descripcion || '')

    try {
      setIsSavingEtapa(true)
      const updateData = {}
      const estadoCambio = idestado && idestado !== editingEtapa.idestado
      if (estadoCambio) {
        const estadosResponse = await fetchEstados()
        const estadosArr = Array.isArray(estadosResponse)
          ? estadosResponse
          : estadosResponse?.data || []
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

      if (idetapa) {
        updateData.idetapa = idetapa
      }
      if (descripcion) {
        updateData.descripcion = descripcion
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
        const updated = await fetchEtapasPorCultivo(selectedCultivo.id)
        setEtapasCultivo(Array.isArray(updated) ? sortEtapasForDisplay(updated) : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'Error actualizando etapa', 'error')
      }
    } catch (error) {
      console.error('Error actualizando etapa:', error)
      const message = error?.response?.data?.message || error?.message || 'Error actualizando etapa'
      showNotification(message, 'error')
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
      showNotification('ID de etapa inválido para anular', 'error')
      return
    }

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
            showNotification(res?.message || 'Error anulando etapa', 'error')
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

  const handleOpenAgregarCosecha = async () => {
    if (!selectedCultivo) {
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
      const etapas = await fetchEtapasPorCultivo(selectedCultivo.id)
      const hasCosechaActiva = Array.isArray(etapas)
        ? etapas.some((etapa) => {
            const nombreEtapa = normalizeStateValue(etapa.nombre || etapa.nombre_etapa)
            const estadoEtapa = normalizeStateValue(etapa.estado || etapa.nombre_estado)
            const isActive = etapa.activo === true || String(etapa.activo).toLowerCase() === 'true' || Number(etapa.activo) === 1
            return nombreEtapa === 'cosecha' && estadoEtapa === 'en-proceso' && isActive
          })
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

      const unidadesArray = cosechaUnidadOptions.length ? cosechaUnidadOptions : await fetchUnidadesMedida()
      const tiposPrecioArray = cosechaTipoPrecioOptions.length ? cosechaTipoPrecioOptions : await fetchTiposPrecio()
      const unidades = Array.isArray(unidadesArray) ? unidadesArray : unidadesArray?.data || []
      const tiposPrecio = Array.isArray(tiposPrecioArray) ? tiposPrecioArray : tiposPrecioArray?.data || []

      setModalFieldOptions({
        unidad_medida: unidades.map((unidad) => ({ value: unidad.id, label: unidad.nombre })),
        tipo_precio: tiposPrecio.map((tipo) => ({ value: tipo.id, label: tipo.nombre })),
      })
      setEditingCosecha(null)
      setModalInitialData({ cantidad: '', unidad_medida: '', precio: '', tipo_precio: '' })
      setDynamicModalType(MODAL_TYPES.COSECHA)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando modal de cosecha:', error)
      showNotification('Error al preparar la cosecha', 'error')
    }
  }

  const handleOpenEditCosecha = async (cosecha) => {
    try {
      const unidadesArray = cosechaUnidadOptions.length ? cosechaUnidadOptions : await fetchUnidadesMedida()
      const tiposPrecioArray = cosechaTipoPrecioOptions.length ? cosechaTipoPrecioOptions : await fetchTiposPrecio()
      const unidades = Array.isArray(unidadesArray) ? unidadesArray : unidadesArray?.data || []
      const tiposPrecio = Array.isArray(tiposPrecioArray) ? tiposPrecioArray : tiposPrecioArray?.data || []

      setModalFieldOptions({
        unidad_medida: unidades.map((unidad) => ({ value: unidad.id, label: unidad.nombre })),
        tipo_precio: tiposPrecio.map((tipo) => ({ value: tipo.id, label: tipo.nombre })),
      })
      setEditingCosecha(cosecha)
      setModalInitialData({
        cantidad: cosecha.cantidad ?? cosecha.cantidad_cosechada ?? '',
        unidad_medida: getCosechaSelectId(cosecha, [
          'unidadId',
          'unidadMedidaId',
          'unidadmedidaid',
          'idunidadmedida',
          'unidad_medida',
          'unidad',
        ]),
        precio: formatMoneyDisplay(cosecha.precio ?? cosecha.precio_unitario ?? ''),
        tipo_precio: getCosechaSelectId(cosecha, [
          'tipoPrecioId',
          'tipoprecioid',
          'idtipo_precio',
          'tipo_precio',
          'tipoPrecio',
        ]),
      })
      setDynamicModalType(MODAL_TYPES.COSECHA)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error cargando datos para editar cosecha:', error)
      showNotification('Error preparando la edición de la cosecha', 'error')
    }
  }

  const handleSubmitAddCosecha = async (formData) => {
    if (!selectedCultivo) {
      showNotification('Selecciona un cultivo primero', 'error')
      return
    }

    try {
      setIsSavingCosecha(true)
      const res = await createCosecha(selectedCultivo.id, {
        cantidad: parseMoneyValue(formData.cantidad),
        idunidadmedida: Number(formData.unidad_medida),
        precio: parseMoneyValue(formData.precio),
        idtipo_precio: Number(formData.tipo_precio),
      })
      if (res && res.success) {
        showNotification('Cosecha agregada correctamente', 'success')
        const updated = await fetchCosechasPorCultivo(selectedCultivo.id)
        setDetalleCosechas(Array.isArray(updated) ? updated : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'No se pudo agregar la cosecha', 'error')
      }
    } catch (error) {
      console.error('Error agregando cosecha:', error)
      const message = error?.response?.data?.message || error?.message || 'Error al agregar cosecha'
      showNotification(message, 'error')
    } finally {
      setIsSavingCosecha(false)
    }
  }

  const handleSubmitEditCosecha = async (formData) => {
    if (!editingCosecha) {
      showNotification('No hay cosecha seleccionada para editar', 'error')
      return
    }

    const cosechaId = Number(editingCosecha.id || editingCosecha.idcosecha || editingCosecha.idCosecha)
    if (!cosechaId || Number.isNaN(cosechaId)) {
      showNotification('ID de cosecha inválido', 'error')
      return
    }

    try {
      setIsSavingCosecha(true)
      const res = await updateCosecha(cosechaId, {
        cantidad: parseMoneyValue(formData.cantidad),
        idunidadmedida: Number(formData.unidad_medida),
        precio: parseMoneyValue(formData.precio),
        idtipo_precio: Number(formData.tipo_precio),
      })
      if (res && res.success) {
        showNotification('Cosecha actualizada correctamente', 'success')
        const updated = await fetchCosechasPorCultivo(selectedCultivo.id)
        setDetalleCosechas(Array.isArray(updated) ? updated : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'No se pudo actualizar la cosecha', 'error')
      }
    } catch (error) {
      console.error('Error actualizando cosecha:', error)
      const message = error?.response?.data?.message || error?.message || 'Error al actualizar cosecha'
      showNotification(message, 'error')
    } finally {
      setIsSavingCosecha(false)
    }
  }

  const handleDeleteCosecha = async (cosecha) => {
    const cosechaId = Number(cosecha.id || cosecha.idcosecha || cosecha.idCosecha)
    if (!cosechaId || Number.isNaN(cosechaId)) {
      showNotification('ID de cosecha inválido', 'error')
      return
    }

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
          const res = await changeCosechaState(cosechaId, 'ANULADO', motivo)
          if (res && res.success) {
            await refreshCultivoDetalleData()
            showNotification('Cosecha anulada correctamente', 'success')
          } else {
            showNotification(res?.message || 'No se pudo anular la cosecha', 'error')
          }
        } catch (error) {
          console.error('Error anulando cosecha:', error)
          const message = error?.response?.data?.message || error?.message || 'Error anulando cosecha'
          showNotification(message, 'error')
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  const handleOpenAddCosto = async () => {
    if (!selectedCultivo) {
      await Swal.fire({
        title: 'AgroGestion',
        text: 'Selecciona un cultivo primero para registrar el costo.',
        icon: 'warning',
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#dc3545',
      })
      return
    }

    try {
      const validation = await validateCultivoForCost(selectedCultivo.id)
      if (!validation?.valid) {
        if (validation?.reason === 'no_active_etapa_en_proceso' || validation?.reason === 'no_etapa_en_proceso') {
          await Swal.fire({
            title: 'AgroGestion',
            text: 'No puede registrar el costo porque el cultivo no tiene una etapa activa en proceso',
            icon: 'warning',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#dc3545',
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
        })
        return
      }

      const activeEtapa = await fetchEtapaEnProcesoPorCultivo(selectedCultivo.id)
      const etapaId = activeEtapa?.id || activeEtapa?.idetapacultivo || null
      if (!etapaId) {
        await Swal.fire({
          title: 'AgroGestion',
          text: 'No se encontró la etapa activa en proceso para asociar el costo.',
          icon: 'warning',
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#dc3545',
        })
        return
      }

      const categoriasArray = costoCategoriaOptions.length ? costoCategoriaOptions : await fetchCategoriasCosto()
      const estadosPagoArray = costoEstadoPagoOptions.length ? costoEstadoPagoOptions : await fetchEstadosPago()
      const categorias = Array.isArray(categoriasArray) ? categoriasArray : categoriasArray?.data || []
      const estadosPago = Array.isArray(estadosPagoArray) ? estadosPagoArray : estadosPagoArray?.data || []

      setModalFieldOptions({
        categoria: categorias.map((cat) => ({ value: cat.id, label: cat.nombre })),
        estado_pago: estadosPago.map((estado) => ({ value: estado.id, label: estado.nombre })),
        subcategoria: [],
      })
      setModalInitialData({ descripcion: '', valor: '', categoria: '', subcategoria: '', estado_pago: '' })
      setEditingCosto(null)
      setActiveCostoEtapaId(etapaId)
      setDynamicModalType(MODAL_TYPES.COSTO)
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando modal de costo:', error)
      showNotification('Error al preparar el costo', 'error')
    }
  }

  const handleOpenEditCosto = async (costo) => {
    try {
      const categoriasArray = costoCategoriaOptions.length ? costoCategoriaOptions : await fetchCategoriasCosto()
      const estadosPagoArray = costoEstadoPagoOptions.length ? costoEstadoPagoOptions : await fetchEstadosPago()
      const categorias = Array.isArray(categoriasArray) ? categoriasArray : categoriasArray?.data || []
      const estadosPago = Array.isArray(estadosPagoArray) ? estadosPagoArray : estadosPagoArray?.data || []

      let subcategoriasArray = []
      const categoriaId = costo.categoriaId || costo.idcategoria || costo.idCategoria || null
      if (categoriaId) {
        const response = await fetchSubcategoriasPorCategoria(categoriaId)
        subcategoriasArray = Array.isArray(response) ? response : response?.data || []
      }

      setModalFieldOptions({
        categoria: categorias.map((cat) => ({ value: cat.id, label: cat.nombre })),
        estado_pago: estadosPago.map((estado) => ({ value: estado.id, label: estado.nombre })),
        subcategoria: subcategoriasArray.map((subcat) => ({ value: subcat.id, label: subcat.nombre })),
      })
      setEditingCosto(costo)
      setDynamicModalType(MODAL_TYPES.COSTO)
      setModalInitialData({
        descripcion: costo.descripcion || '',
        valor: formatMoneyDisplay(costo.valor || ''),
        categoria: categoriaId || '',
        subcategoria: costo.subcategoriaId || costo.idsubcategoria || costo.idSubcategoria || '',
        estado_pago: costo.estadoPagoId || costo.idestado_pago || costo.idEstadoPago || costo.estado_pago || '',
      })
      setShowDynamicModal(true)
    } catch (error) {
      console.error('Error preparando edición de costo:', error)
      showNotification('Error al editar el costo', 'error')
    }
  }

  const handleSubmitAddCosto = async (formData) => {
    if (!selectedCultivo) {
      showNotification('Selecciona un cultivo primero', 'error')
      return
    }
    try {
      setIsSavingCosto(true)
      const res = await createCosto({
        descripcion: formData.descripcion || '',
        valor: parseMoneyValue(formData.valor),
        idcultivo: selectedCultivo.id,
        idetapa_cultivo: activeCostoEtapaId,
        idusuario: Number(session?.id || worker?.id || 0),
        idsubcategoria: Number(formData.subcategoria),
        idfinca: Number(validFincaId),
        idestado_pago: Number(formData.estado_pago),
      })
      if (res && res.success) {
        showNotification('Costo registrado correctamente', 'success')
        const detalle = await fetchCultivoDetalle(selectedCultivo.id)
        const costs = Array.isArray(detalle)
          ? detalle
          : detalle?.costos || detalle?.detalle || detalle?.detalleCostos || []
        setDetalleCostos(Array.isArray(costs) ? costs : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'Error registrando costo', 'error')
      }
    } catch (error) {
      console.error('Error registrando costo:', error)
      const message = error?.response?.data?.message || error?.message || 'Error registrando costo'
      showNotification(message, 'error')
    } finally {
      setIsSavingCosto(false)
    }
  }

  const handleSubmitEditCosto = async (formData) => {
    if (!editingCosto) {
      showNotification('No hay costo seleccionado para editar', 'error')
      return
    }

    const costoId = Number(editingCosto.id || editingCosto.idcosto || editingCosto.idCosto)
    if (!costoId || Number.isNaN(costoId)) {
      showNotification('ID de costo inválido', 'error')
      return
    }

    try {
      setIsSavingCosto(true)
      const res = await updateCosto(costoId, {
        descripcion: formData.descripcion || '',
        valor: parseMoneyValue(formData.valor),
        idsubcategoria: Number(formData.subcategoria),
        idestado_pago: Number(formData.estado_pago),
      })
      if (res && res.success) {
        showNotification('Costo actualizado correctamente', 'success')
        const detalle = await fetchCultivoDetalle(selectedCultivo.id)
        const costs = Array.isArray(detalle)
          ? detalle
          : detalle?.costos || detalle?.detalle || detalle?.detalleCostos || []
        setDetalleCostos(Array.isArray(costs) ? costs : [])
        handleCloseModal()
      } else {
        showNotification(res?.message || 'Error actualizando costo', 'error')
      }
    } catch (error) {
      console.error('Error actualizando costo:', error)
      const message = error?.response?.data?.message || error?.message || 'Error actualizando costo'
      showNotification(message, 'error')
    } finally {
      setIsSavingCosto(false)
    }
  }

  const handleDeleteCosto = async (costo) => {
    const costoId = Number(costo.id || costo.idcosto || costo.idCosto)
    if (!costoId || Number.isNaN(costoId)) {
      showNotification('ID de costo inválido', 'error')
      return
    }

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
          const res = await changeCostoState(costoId, 'ANULADO', motivo)
          if (res && res.success) {
            await refreshCultivoDetalleData()
            showNotification('Costo anulado correctamente', 'success')
          } else {
            showNotification(res?.message || 'No se pudo anular el costo', 'error')
          }
        } catch (error) {
          console.error('Error anulando costo:', error)
          const message = error?.response?.data?.message || error?.message || 'Error anulando costo'
          showNotification(message, 'error')
        } finally {
          setReasonModal((r) => ({ ...r, isOpen: false }))
        }
      },
      cancelCallback: () => setReasonModal((r) => ({ ...r, isOpen: false })),
    })
  }

  const handleSubmitModal = async (formData) => {
    switch (dynamicModalType) {
      case MODAL_TYPES.ETAPA:
        if (editingEtapa) {
          await handleSubmitEditEtapa(formData)
        } else {
          await handleSubmitAddEtapa(formData)
        }
        break
      case MODAL_TYPES.COSECHA:
        if (editingCosecha) {
          await handleSubmitEditCosecha(formData)
        } else {
          await handleSubmitAddCosecha(formData)
        }
        break
      case MODAL_TYPES.COSTO:
        if (editingCosto) {
          await handleSubmitEditCosto(formData)
        } else {
          await handleSubmitAddCosto(formData)
        }
        break
      default:
        break
    }
  }

  const isEditingModal = Boolean(editingEtapa || editingCosecha || editingCosto)

  const stats = useMemo(() => {
    if (!worker || !validFincaId) {
      return { total: 0, enProceso: 0, finalizados: 0, fincas: 0 }
    }
    const list = cultivosFinca || []
    return {
      total: list.length,
      enProceso: list.filter((c) => normalizeStateValue(c.estado) === 'en-proceso').length,
      finalizados: list.filter((c) => normalizeStateValue(c.estado) === 'finalizado').length,
      fincas: fincasAsignadas.length,
    }
  }, [worker, validFincaId, cultivosFinca, fincasAsignadas])

  const resumenRows = useMemo(() => {
    if (!worker || !validFincaId) return []
    return (cultivosFinca || []).filter((c) => normalizeStateValue(c.estado) === 'en-proceso')
  }, [worker, validFincaId, cultivosFinca])

  const filteredCultivos = useMemo(() => {
    if (!Array.isArray(cultivosFinca)) return []
    const normalizedFilterEstadoCultivo = normalizeStateValue(filterEstadoCultivo)
    return cultivosFinca.filter((cultivo) => {
      const searchTerm = searchCultivoTerm.trim().toLowerCase()
      const matchesSearch = !searchTerm || (cultivo.nombre || '').toLowerCase().includes(searchTerm)
      const matchesEstado = filterEstadoCultivo === 'todos' || normalizeStateValue(cultivo.estado) === normalizedFilterEstadoCultivo
      return matchesSearch && matchesEstado
    })
  }, [cultivosFinca, searchCultivoTerm, filterEstadoCultivo])

  const etapasRows = useMemo(() => {
    const etapas = etapasCultivo || []
    const normalizedFilterEtapaEstado = normalizeStateValue(filterEtapaEstado)
    const filtered = etapas.filter((etapa) => {
      const nombre = (etapa.nombre || '').toLowerCase()
      const estado = normalizeStateValue(etapa.estado || etapa.nombre_estado)
      const searchTerm = searchEtapaTerm.trim().toLowerCase()
      const matchesSearch = !searchTerm || nombre.includes(searchTerm)
      const matchesEstado = filterEtapaEstado === 'todos' || estado === normalizedFilterEtapaEstado
      const registroEstado = getRegistroEstado(etapa)
      const matchesRegistroEstado = etapasEstado === 'TODOS'
        ? true
        : registroEstado === etapasEstado
      return matchesSearch && matchesEstado && matchesRegistroEstado
    })

    if (filtered.length === 0) {
      return [
        <tr key="no-etapas" className="data-item">
          <td colSpan={etapasEstado === 'ACTIVO' ? 6 : 5} style={{ textAlign: 'center', color: '#666' }}>
            No se encontraron etapas registradas.
          </td>
        </tr>,
      ]
    }

    return filtered.map((etapa, i) => {
      const normaEstado = normalizeStateValue(etapa.estado || etapa.nombre_estado || 'desconocido')
      return (
        <tr key={i} className="data-item">
          <td data-field="nombre">
            <span className={`detalle-cultivo-badge-etapa`}>{etapa.nombre || '--'}</span>
          </td>
          <td data-field="descripcion">{etapa.descripcion || '--'}</td>
          <td data-field="fecha-inicio">{formatDateDisplay(etapa.fechaInicio || etapa.fecha_inicio)}</td>
          <td data-field="fecha-final">{formatDateDisplay(etapa.fechaFinal || etapa.fecha_final)}</td>
          <td data-field="estado">
            <span className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${normaEstado}`}>
              {etapa.estado ? etapa.estado.replace(/-/g, ' ') : '--'}
            </span>
          </td>
          {etapasEstado === 'ACTIVO' && (
            <td data-field="acciones">
              <div className="action-buttons">
                <button type="button" className="btn-icon btn-edit" title="Editar" onClick={() => handleOpenEditEtapa(etapa)}>
                  ✏️
                </button>
                <button type="button" className="btn-icon btn-delete" title="Anular" onClick={() => handleDeleteEtapa(etapa)}>
                  {'\uD83D\uDEAB'}
                </button>
              </div>
            </td>
          )}
        </tr>
      )
    })
  }, [etapasCultivo, searchEtapaTerm, filterEtapaEstado, etapasEstado])

  const filteredCosechas = useMemo(() => {
    let cosechas = detalleCosechas || []
    if (detalleCosechasEstado && detalleCosechasEstado !== 'TODOS') {
      cosechas = cosechas.filter((cosecha) => {
        const reg = getRegistroEstado(cosecha)
        return String(reg || '').toUpperCase() === String(detalleCosechasEstado).toUpperCase()
      })
    }
    const desde = cosechaFilterFechaDesde ? new Date(cosechaFilterFechaDesde) : null
    const hasta = cosechaFilterFechaHasta ? new Date(cosechaFilterFechaHasta) : null
    return cosechas.filter((cosecha) => {
      const fechaValor = cosecha.fecha || cosecha.fechaCosecha || cosecha.fecha_cosecha
      const fecha = parseDateString(fechaValor)
      if (!fecha) return true
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      return true
    })
  }, [detalleCosechas, detalleCosechasEstado, cosechaFilterFechaDesde, cosechaFilterFechaHasta])

  const costosSource = useMemo(() => detalleCostos || [], [detalleCostos])

  const filteredCostos = useMemo(() => {
    let list = costosSource
    if (detalleCostosEstado && detalleCostosEstado !== 'TODOS') {
      list = list.filter((costo) => {
        const reg = getRegistroEstado(costo)
        return String(reg || '').toUpperCase() === String(detalleCostosEstado).toUpperCase()
      })
    }
    if (filterCat !== 'todos') {
      list = list.filter((costo) => (costo.categoria || '').toLowerCase().replace(/ /g, '-') === filterCat)
    }
    if (filterEtapa !== 'todos') {
      list = list.filter((costo) => normEtapaKey(costo.etapa) === filterEtapa)
    }
    if (filterEstadoPago !== 'todos') {
      list = list.filter((costo) => {
        const estadoPago = (costo.estado_pago || costo.estado || '').toString().toLowerCase().replace(/ /g, '-')
        return estadoPago === filterEstadoPago
      })
    }
    if (filterDesde || filterHasta) {
      list = list.filter((costo) => {
        const fechaCosto = parseDateString(costo.fecha)
        if (!fechaCosto) return false
        if (filterDesde) {
          const desde = new Date(filterDesde)
          if (fechaCosto < desde) return false
        }
        if (filterHasta) {
          const hasta = new Date(filterHasta)
          if (fechaCosto > hasta) return false
        }
        return true
      })
    }
    return list
  }, [costosSource, detalleCostosEstado, filterCat, filterEtapa, filterEstadoPago, filterDesde, filterHasta])

  const costosTotales = useMemo(() => {
    let total = 0
    filteredCostos.forEach((c) => {
      total += parseMoneyValue(c.valor)
    })
    return { total, count: filteredCostos.length }
  }, [filteredCostos])

  const switchSection = useCallback(
    (sectionId) => {
      if (sectionId !== 'detalle-cultivo') {
        setSelectedCultivo(null)
        localStorage.removeItem(WORKER_SELECTED_CULTIVO_KEY)
        setFilterCat('todos')
        setFilterEtapa('todos')
        setFilterDesde('')
        setFilterHasta('')
      }
      setActiveSection(sectionId)
      if (SECTION_TITLES[sectionId]) {
        setPageTitle(SECTION_TITLES[sectionId] === 'Inicio' ? 'Inicio - Mi panel' : SECTION_TITLES[sectionId])
      }
    },
    [],
  )

  const openCultivoDetail = (cultivo) => {
    setSelectedCultivo(cultivo)
    localStorage.setItem(WORKER_SELECTED_CULTIVO_KEY, String(cultivo.id))
    setFilterCat('todos')
    setFilterEtapa('todos')
    setFilterDesde('')
    setFilterHasta('')
    setActiveSection('detalle-cultivo')
    setPageTitle(`Detalle del Cultivo: ${cultivo.nombre}`)
    setElementosOpen(false)
  }

  const backToCultivos = () => {
    setSelectedCultivo(null)
    localStorage.removeItem(WORKER_SELECTED_CULTIVO_KEY)
    setElementosOpen(false)
    switchSection('cultivos')
    setPageTitle('Mis Cultivos')
  }

  const onLogout = async () => {
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

    await logoutUser()
    clearTokens()
    navigate('/', { replace: true })
  }

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openInventario = (descripcion) => {
    setElementosRows(getInventarioElementos(descripcion, 'cultivo'))
    setElementosOpen(true)
    setTimeout(() => document.getElementById('elementos-inventario-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const navItems = [
    {
      title: 'Principal',
      links: [{ section: 'inicio', label: 'Inicio', icon: '🏡' }],
    },
    {
      title: 'Gestión',
      links: [{ section: 'cultivos', label: 'Cultivos', icon: '🌱' }],
    },
  ]

  useEffect(() => {
    localStorage.setItem('workerActiveSection', activeSection)
  }, [activeSection])

  const workerFullName = [worker?.nombre, worker?.apellidos].filter(Boolean).join(' ') || worker?.email || 'Cuenta'

  if (!worker) {
    return null
  }

  return (
    <div className="container">
      <Sidebar
        roleSubtitle="Rol: Trabajador"
        fincaOptions={fincasAsignadas}
        fincaLoading={isLoadingFincas}
        fincaValue={validFincaId ? String(validFincaId) : ''}
        onFincaChange={(id) => setFincaId(id)}
        navItems={navItems}
        activeNavSection={activeSection === 'detalle-cultivo' ? null : activeSection}
        onNavClick={(sectionId) => switchSection(sectionId)}
        accountName={workerFullName}
        accountEmail={worker.email}
        onLogout={onLogout}
      />

      <main className="main-content">
        <Header
          title={pageTitle}
          showNavCultivo={activeSection === 'detalle-cultivo'}
          onScrollToSection={scrollToSection}
        />

        <div className="content-container">
          {fincasError ? (
            <div className="dashboard-error" role="alert">{fincasError}</div>
          ) : !isLoadingFincas && fincasAsignadas.length === 0 ? (
            <div className="dashboard-empty" role="status">No tienes fincas activas asignadas.</div>
          ) : null}

          <section id="inicio-section" className={`content-section ${activeSection === 'inicio' ? 'active' : ''}`}>
            <div className="welcome-container">
              <h2 id="welcomeMessage">¡Bienvenido, {workerFullName}!</h2>
              <p className="welcome-subtitle">Estadísticas de tus cultivos</p>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">🌱</div>
                <div className="stat-info">
                  <h4>Cultivos Asignados</h4>
                  <p className="stat-value" id="estatCultivosAsignados">
                    {stats.total}
                  </p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <h4>En Proceso</h4>
                  <p className="stat-value" id="estatCultivosEnProceso">
                    {stats.enProceso}
                  </p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✨</div>
                <div className="stat-info">
                  <h4>Finalizados</h4>
                  <p className="stat-value" id="estatCultivosFinalizados">
                    {stats.finalizados}
                  </p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <h4>Fincas Asignadas</h4>
                  <p className="stat-value" id="estatFincasAsignadas">
                    {stats.fincas}
                  </p>
                </div>
              </div>
            </div>

            <div className="info-section" style={{ marginTop: 40 }}>
              <div className="section-info-header">
                <h3>Tus Cultivos Actuales</h3>
              </div>
              <div className="table-container resumen">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cultivo</th>
                      <th>Tipo</th>
                      <th>Fecha Inicio</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody id="cultivos-resumen-tbody">
                    {resumenRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>
                          Sin cultivos asignados
                        </td>
                      </tr>
                    ) : (
                      resumenRows.map((c) => (
                        <tr key={c.id}>
                          <td data-field="nombre">{c.nombre}</td>
                          <td data-field="tipo">{c.tipo}</td>
                          <td data-field="fecha-inicio">{formatDateDisplay(c.fechaInicio)}</td>
                                <td data-field="estado">
                                  <span className={`worker-cultivo-badge-estado worker-cultivo-badge-estado-${normalizeStateValue(c.estado)}`}>{c.estado ? c.estado.replace(/-/g, ' ') : '--'}</span>
                                </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

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
                  value={filterEstadoCultivo}
                  onChange={(e) => setFilterEstadoCultivo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="en-proceso">En Proceso</option>
                  <option value="en-pausa">En Pausa</option>
                  <option value="suspendido">Suspendido</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>
            </div>
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
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="cultivos-tbody">
                  {isLoadingCultivosFinca ? (
                    <tr className="data-item">
                      <td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>
                        Cargando cultivos...
                      </td>
                    </tr>
                  ) : filteredCultivos.length === 0 ? (
                    <tr className="data-item">
                      <td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>
                        No se encontraron cultivos registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredCultivos.map((cultivo) => {
                      const estadoClass = (cultivo.estado || 'desconocido').toLowerCase().replace(/\s+/g, '-')
                      return (
                        <tr
                          key={cultivo.id}
                          className="data-item cultivo-clickeable"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            if (e.target.closest('.action-buttons')) return
                            openCultivoDetail(cultivo)
                          }}
                        >
                          <td data-field="nombre">{capitalizeWords(cultivo.nombre || '--')}</td>
                          <td data-field="tipo">{cultivo.tipo || '--'}</td>
                          <td data-field="fecha-siembra">{formatDateDisplay(cultivo.fechaInicio)}</td>
                          <td data-field="fecha-final">{formatDateDisplay(cultivo.fechaCosecha)}</td>
                          <td data-field="etapa-actual">{cultivo.etapaActual || cultivo.etapa_actual || '--'}</td>
                          <td data-field="estado">
                            <span className={`status-badge status-${estadoClass}`}>
                              {cultivo.estado ? cultivo.estado.replace(/-/g, ' ') : '--'}
                            </span>
                          </td>
                          <td data-field="acciones">
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="btn-icon btn-view"
                                title="Ver detalles"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCultivoDetail(cultivo)
                                }}
                              >
                                👁️
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section id="detalle-cultivo-section" className={`content-section ${activeSection === 'detalle-cultivo' ? 'active' : ''}`}>
            <div className="section-header">
              <button type="button" className="btn-back" id="btn-back-cultivos" onClick={backToCultivos}>
                ← Volver a Cultivos
              </button>
            </div>

            {selectedCultivo ? (
              <>
                <div className="cultivo-estado-container">
                  <label className="estado-label">Estado actual:</label>
                  {(() => {
                    const estadoRaw = selectedCultivo.estado || ''
                    const estadoKey = estadoRaw ? estadoRaw.toLowerCase().replace(/\s+/g, '-') : 'desconocido'
                    const estadoLabel = estadoRaw ? estadoRaw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim() : '--'
                    return (
                      <span id="cultivo-estado-badge" className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${estadoKey}`}>
                        {estadoLabel}
                      </span>
                    )
                  })()}
                </div>

                <div className="info-section" id="etapas-section">
                  <div className="section-info-header">
                    <h3>Etapas</h3>
                    <button type="button" className="btn-add btn-primary" onClick={openAddEtapaModal}>
                      + Agregar Nueva Etapa
                    </button>
                  </div>
                  <div className="search-filter-wrapper">
                    <div className="search-wrapper">
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar por nombre..."
                        value={searchEtapaTerm}
                        onChange={(e) => setSearchEtapaTerm(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-search"
                        onClick={() => setSearchEtapaTerm('')}
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
                          <th colSpan={etapasEstado === 'ACTIVO' ? 6 : 5}>Etapas Registradas</th>
                        </tr>
                        <tr>
                          <th>Nombre</th>
                          <th>Descripción</th>
                          <th>Fecha Inicio</th>
                          <th>Fecha Final</th>
                          <th>Estado</th>
                          {etapasEstado === 'ACTIVO' && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody id="etapas-tbody">
                        {isLoadingEtapas ? (
                          <tr className="data-item">
                            <td colSpan={etapasEstado === 'ACTIVO' ? 6 : 5} style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                              Cargando etapas...
                            </td>
                          </tr>
                        ) : (
                          etapasRows
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="info-section" id="cosechas-section">
                  <div className="section-info-header">
                    <h3>Cosechas</h3>
                    <button type="button" className="btn-add btn-primary" onClick={handleOpenAgregarCosecha}>
                      + Agregar Nueva Cosecha
                    </button>
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
                          <th colSpan={detalleCosechasEstado === 'ACTIVO' ? 6 : 5}>Cosechas Realizadas</th>
                        </tr>
                        <tr>
                          <th>Fecha</th>
                          <th>Cantidad</th>
                          <th>Unidad Medida</th>
                          <th>Precio</th>
                          <th>Tipo Precio</th>
                          {detalleCosechasEstado === 'ACTIVO' && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody id="cosechas-tbody">
                        {isLoadingCosechas ? (
                          <tr className="data-item">
                            <td colSpan={detalleCosechasEstado === 'ACTIVO' ? 6 : 5} style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                              Cargando cosechas...
                            </td>
                          </tr>
                        ) : filteredCosechas.length === 0 ? (
                          <tr className="data-item">
                            <td colSpan={detalleCosechasEstado === 'ACTIVO' ? 6 : 5} style={{ textAlign: 'center', color: '#666' }}>
                              No se encontraron cosechas registradas.
                            </td>
                          </tr>
                        ) : (
                          filteredCosechas.map((cosecha, i) => (
                            <tr key={cosecha.id ?? i} className="data-item">
                              <td data-field="fecha">{formatDateDisplay(cosecha.fecha || cosecha.fechaCosecha || cosecha.fecha_cosecha)}</td>
                              <td data-field="cantidad">{cosecha.cantidad || cosecha.cantidad_cosechada || '--'}</td>
                              <td data-field="unidad">{cosecha.unidad || cosecha.unidad_medida || cosecha.unidad?.nombre || cosecha.unidadMedida || '--'}</td>
                              <td data-field="precio">{formatMoneyDisplay(cosecha.precio || cosecha.precio_unitario)}</td>
                              <td data-field="tipo-precio">{cosecha.tipoPrecio || cosecha.tipo_precio || cosecha.tipoprecio || cosecha.tipoPrecio?.nombre || '--'}</td>
                              {detalleCosechasEstado === 'ACTIVO' && (
                                <td data-field="acciones">
                                  <div className="action-buttons">
                                    <button type="button" className="btn-icon btn-edit" title="Editar" onClick={() => handleOpenEditCosecha(cosecha)}>
                                      ✏️
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
                    <button type="button" className="btn-add btn-primary" onClick={handleOpenAddCosto}>
                      + Agregar Nuevo Costo
                    </button>
                  </div>
                  <div className="search-filter-wrapper">
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por etapa:</label>
                      <select className="filter-select filter-etapa-costos" value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="preparacion">Preparación</option>
                        <option value="siembra">Siembra</option>
                        <option value="crecimiento">Crecimiento</option>
                        <option value="en-produccion">En Producción</option>
                        <option value="cosecha">Cosecha</option>
                      </select>
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por categoría:</label>
                      <select className="filter-select filter-categoria-costos" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="mano-obra">Mano de Obra</option>
                        <option value="materia-prima">Materia Prima</option>
                        <option value="servicios">Servicios</option>
                        <option value="costos-indirectos">Costos Indirectos</option>
                      </select>
                    </div>
                    <div className="filter-wrapper">
                      <label className="filter-label">Filtrar por estado de pago:</label>
                      <select className="filter-select filter-estado-pago-cultivo" value={filterEstadoPago} onChange={(e) => setFilterEstadoPago(e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="pagado">Pagado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                    <div className="filter-wrapper" style={{ width: '100%' }}>
                      <label className="filter-label">Rango de fechas:</label>
                      <div className="date-range">
                        <input type="date" className="filter-date filter-fecha-desde" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} />
                        <span className="date-separator">-</span>
                        <input type="date" className="filter-date filter-fecha-hasta" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="totales-bar">
                    <span className="total-item">
                      Total:{' '}
                      <strong id="total-costos">
                        {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(costosTotales.total)}
                      </strong>
                    </span>
                    <span className="total-item">
                      Registros:{' '}
                      <strong id="total-registros">{costosTotales.count}</strong>
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
                          <th colSpan={detalleCostosEstado === 'ACTIVO' ? 9 : 8} style={{ backgroundColor: 'var(--bg-header)' }}>
                            Costos Registrados del Cultivo
                          </th>
                        </tr>
                        <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                          <th>Fecha</th>
                          <th>Usuario</th>
                          <th>Categoría</th>
                          <th>Subcategoría</th>
                          <th>Etapa</th>
                          <th>Info Adicional</th>
                          <th>Valor</th>
                          <th>Estado</th>
                          {detalleCostosEstado === 'ACTIVO' && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody id="costos-cultivo-tbody">
                        {isLoadingCostos ? (
                          <tr className="data-item">
                            <td colSpan={detalleCostosEstado === 'ACTIVO' ? 9 : 8} style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                              Cargando costos...
                            </td>
                          </tr>
                        ) : filteredCostos.length === 0 ? (
                          <tr className="data-item">
                            <td colSpan={detalleCostosEstado === 'ACTIVO' ? 9 : 8} style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                              No se encontraron costos con los filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          filteredCostos.map((costo, i) => {
                            const toastClass = costo.categoria === 'Materia Prima' ? 'clickeable-materia-prima' : ''
                            return (
                              <tr
                                key={i}
                                className={`data-item ${toastClass}`}
                                style={{ cursor: costo.categoria === 'Materia Prima' ? 'pointer' : undefined }}
                                onClick={(e) => {
                                  if (costo.categoria !== 'Materia Prima') return
                                  if (e.target.closest('.action-buttons')) return
                                  openInventario(costo.descripcion)
                                }}
                              >
                                <td data-field="fecha">{formatDateDisplay(costo.fecha)}</td>
                                <td data-field="usuario">{costo.usuario || '--'}</td>
                                <td data-field="categoria">
                                  <span className={`detalle-cultivo-badge-categoria cat-${(costo.categoria || '').toLowerCase().replace(/ /g, '-')}`}>
                                    {costo.categoria || '--'}
                                  </span>
                                </td>
                                <td data-field="subcategoria">
                                  <span className={`detalle-cultivo-badge-subcategoria sub-cat-${(costo.categoria || '').toLowerCase().replace(/ /g, '-')}`}>
                                    {costo.subcategoria || '--'}
                                  </span>
                                </td>
                                <td data-field="etapa">
                                  <span className={`detalle-cultivo-badge-etapa detalle-cultivo-badge-etapa-${normEtapaKey(costo.etapa)}`}>
                                    {costo.etapa || '--'}
                                  </span>
                                </td>
                                <td data-field="descripcion">{costo.descripcion || '--'}</td>
                                <td data-field="valor">{formatMoneyDisplay(costo.valor)}</td>
                                <td data-field="estado">
                                  <span className={`detalle-cultivo-badge-estado detalle-cultivo-badge-estado-${(costo.estado_pago || costo.estado || 'pendiente').toString().toLowerCase().replace(/\s+/g, '-')}`}>
                                    {(costo.estado_pago || costo.estado || 'Pendiente').toString().replace(/-/g, ' ')}
                                  </span>
                                </td>
                                {detalleCostosEstado === 'ACTIVO' && (
                                  <td data-field="acciones">
                                    <div className="action-buttons">
                                      <button type="button" className="btn-icon btn-edit" title="Editar" onClick={() => handleOpenEditCosto(costo)}>
                                        ✏️
                                      </button>
                                      <button type="button" className="btn-icon btn-delete" title="Anular" onClick={() => handleDeleteCosto(costo)}>
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

                <div id="elementos-inventario-section" className="info-section" style={{ display: elementosOpen ? 'block' : 'none' }}>
                  <div className="section-info-header">
                    <h3>Información del Inventario </h3>
                    <button type="button" className="btn-close-elements" id="btn-close-elementos" onClick={() => setElementosOpen(false)}>
                      ✕ Cerrar
                    </button>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr className="table-title-row">
                          <th colSpan={5} style={{ backgroundColor: 'var(--bg-header)' }}>
                            Elementos usados del inventario
                          </th>
                        </tr>
                        <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                          <th>Producto</th>
                          <th>Precio Producto</th>
                          <th>Cantidad Usada</th>
                          <th>Medida Usada</th>
                          <th>Costo Total</th>
                        </tr>
                      </thead>
                      <tbody id="elementos-inventario-tbody">
                        {elementosRows.map((el, idx) => (
                          <tr key={idx} className="data-item">
                            <td data-field="producto">{el.producto}</td>
                            <td data-field="precio">{el.precioFmt}</td>
                            <td data-field="cantidad">{el.cantidad}</td>
                            <td data-field="medida">{el.medida}</td>
                            <td data-field="total">{el.totalFmt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
        <DynamicModal
          isOpen={showDynamicModal}
          modalType={dynamicModalType}
          onClose={handleCloseModal}
          onSubmit={handleSubmitModal}
          onFieldChange={handleCostoFieldChange}
          fieldOptions={modalFieldOptions}
          initialData={modalInitialData}
          isEditing={isEditingModal}
        />
        <ReasonModal
          isOpen={reasonModal.isOpen}
          title={reasonModal.title}
          question={reasonModal.question}
          onConfirm={reasonModal.callback || (() => {})}
          onCancel={reasonModal.cancelCallback || (() => setReasonModal((r) => ({ ...r, isOpen: false })))}
        />
      </main>
    </div>
  )
}
