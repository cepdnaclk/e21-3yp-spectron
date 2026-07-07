// Centralized copy and section data keeps the React components focused on layout.
export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Product', href: '/product' },
  { label: 'Collections', href: '/modules' },
  { label: 'Bundles', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
]

export const heroStats = [
  { value: 'LK', label: 'Built for local growers' },
  { value: '4+', label: 'Agri bundle options' },
  { value: '24/7', label: 'Field alert readiness' },
]

export const problemPoints = [
  'Single-purpose devices force teams to buy new hardware for every sensing task.',
  'Firmware changes often require technical rebuilds, reflashing, and repeated field visits.',
  'Fragmented dashboards make monitoring, alerts, battery state, and access control harder to scale.',
]

export const solutionPoints = [
  'One standardized adapter accepts multiple sensor modules for paddy, tea, greenhouse, and storage sites.',
  'Firmware settings and device behavior are configured through a web dashboard for local operations teams.',
  'Secure cloud connectivity, real-time alerts, and signed OTA updates support farm field use.',
]

export const benefits = [
  {
    icon: 'Repeat2',
    title: 'Reusable core',
    text: 'Keep the controller, battery, network stack, and enclosure consistent while swapping sensor modules for each application.',
  },
  {
    icon: 'Settings2',
    title: 'Configurable deployment',
    text: 'Tune thresholds, sampling intervals, alert rules, and reporting behavior without rebuilding the whole system.',
  },
  {
    icon: 'BatteryCharging',
    title: 'Battery-aware design',
    text: 'Low-power monitoring profiles help field devices stay online longer while still reporting critical changes.',
  },
  {
    icon: 'CloudCog',
    title: 'Cloud ready',
    text: 'Devices connect into a dashboard, event pipeline, and storage layer built for temperature, humidity, pressure, ultrasonic, gas, and occupancy sensing across many Sri Lankan farm sites.',
  },
]

export const features = [
  {
    icon: 'Puzzle',
    title: 'Modular sensor compatibility',
    text: 'Attach temperature, humidity, pressure, ultrasonic, odour/gas, light, motion, attendance, or custom modules to the same reusable device platform for agri use.',
  },
  {
    icon: 'Cpu',
    title: 'Reusable hardware core',
    text: 'A stable controller and power module reduce duplicated electronics and make deployments easier to maintain.',
  },
  {
    icon: 'SlidersHorizontal',
    title: 'Configurable firmware settings',
    text: 'Change sampling rates, calibration values, thresholds, and device modes from the dashboard.',
  },
  {
    icon: 'MonitorSmartphone',
    title: 'Web monitoring dashboard',
    text: 'Track live device state, sensor readings, alerts, site grouping, and battery health in one interface designed for growers and field teams.',
  },
  {
    icon: 'BellRing',
    title: 'Real-time alerts',
    text: 'Notify operators when readings cross limits, devices lose connectivity, or battery drops below policy across rural sites.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Secure cloud connectivity',
    text: 'Use authenticated device identity, encrypted transport, role-based access, and signed OTA firmware updates.',
  },
]

export const sensorModules = [
  {
    icon: 'Sprout',
    name: 'SHT30 Temperature + Humidity',
    category: 'Environment',
    summary: 'Greenhouse climate, nursery control, cold-room storage, and field shed monitoring.',
    limitations: [
      'Measures temperature and humidity only; it does not measure pressure, gas, light, or occupancy.',
      'Humidity readings can be affected by condensation, very fast airflow changes, or long exposure to harsh environments.',
      'Best suited for environmental monitoring rather than direct process control.',
    ],
    useCases: ['greenhouse climate', 'nursery control', 'cold-room', 'produce storage', 'seedling monitoring', 'incubator monitoring'],
  },
  {
    icon: 'Factory',
    name: 'BME280 / BMP280 Pressure',
    category: 'Trend monitoring',
    summary: 'Barometric, sealed-room drift, ventilation/filter condition, and process pressure trends for agri buildings.',
    limitations: [
      'BMP280 measures pressure and temperature only; it does not measure humidity.',
      'BME280 adds humidity, but it is still best for trends and alerts rather than precision industrial metrology.',
      'Pressure readings need calibration and altitude compensation if you want stable barometric results.',
    ],
    useCases: ['barometric trend', 'sealed-room drift', 'ventilation filter trend', 'tank pressure trend', 'line pressure trend'],
  },
  {
    icon: 'Warehouse',
    name: 'Ultrasonic Distance',
    category: 'Level / occupancy',
    summary: 'Water tank level, irrigation tank level, storage bin fill level, and simple occupancy.',
    limitations: [
      'Raw distance must be interpreted into fill-level or occupancy logic.',
      'Performance can drop on soft, angled, or irregular surfaces.',
      'Environmental noise, foam, or heavy dust can reduce measurement quality in some installations.',
    ],
    useCases: ['water tank level', 'irrigation tank level', 'silo level', 'storage bin level', 'queue buildup'],
  },
  {
    icon: 'BellRing',
    name: 'Odour / Gas',
    category: 'Air safety',
    summary: 'Odour escalation, compost area alert, waste-room smell alert, and calibrated gas warnings.',
    limitations: [
      'Odour sensors usually provide relative trend or risk bands, not exact smell or gas concentration names.',
      'Many gas sensors need warm-up and calibration before the readings are trustworthy.',
      'Humidity, temperature, and airflow can affect stability, so threshold tuning is important.',
    ],
    useCases: ['compost odor', 'store room smell', 'waste room smell', 'gas leak', 'unsafe air warning'],
  },
  {
    icon: 'MonitorSmartphone',
    name: 'Light',
    category: 'Environment',
    summary: 'Greenhouse daylight, shade-house brightness, and site lighting visibility.',
    useCases: ['greenhouse', 'shade-house', 'lighting'],
  },
  {
    icon: 'RadioTower',
    name: 'Presence / Motion',
    category: 'Occupancy',
    summary: 'Gate presence, doorway occupancy, security-aware motion, and farm entry sensing.',
    useCases: ['gate presence', 'doorway presence', 'occupancy', 'security'],
  },
]

export const workflow = [
  {
    step: '01',
    title: 'Choose a sensor module',
    text: 'Select the sensor pack for greenhouse, paddy field support, tea estate storage, pressure trend, ultrasonic level, odour/gas, motion, light, or a custom use case.',
  },
  {
    step: '02',
    title: 'Attach it to the core',
    text: 'Connect the module to the standardized hardware core with the battery and communication board already in place.',
  },
  {
    step: '03',
    title: 'Configure in the web app',
    text: 'Set sampling behavior, alert thresholds, data labels, location, access roles, and update policy for farm staff.',
  },
  {
    step: '04',
    title: 'Deploy and monitor',
    text: 'Stream readings securely, receive alerts, watch battery status, and push signed OTA updates when needed.',
  },
]

export const industries = [
  {
    icon: 'Sprout',
    title: 'Greenhouses',
    text: 'Temperature, humidity, pressure trend, light, and gas monitoring for Sri Lankan protected cultivation.',
  },
  {
    icon: 'Snowflake',
    title: 'Cold storage',
    text: 'Temperature, humidity, and door-state visibility for export produce and local perishable inventory.',
  },
  {
    icon: 'IdCard',
    title: 'Staff access',
    text: 'Configurable presence or access sensing using the same platform primitives for farm staff and depots.',
  },
  {
    icon: 'Building2',
    title: 'Facilities',
    text: 'Motion, air quality, utility, and asset condition monitoring across farm offices and storage sites.',
  },
  {
    icon: 'Warehouse',
    title: 'Warehousing',
    text: 'Ambient, pressure, occupancy, fill-level, and storage-condition signals for agro-distribution visibility.',
  },
  {
    icon: 'Factory',
    title: 'Farm pilots',
    text: 'Reusable field units for fast sensing experiments before committing to custom hardware, including irrigation and storage alerts.',
  },
]

export const securityControls = [
  'X.509 device identity',
  'MQTT over TLS and HTTPS',
  'mTLS service communication',
  'OAuth2 and JWT sessions',
  'Role-based access control',
  'Kafka ACL event policies',
  'Signed OTA firmware updates',
  'Encrypted storage backups',
]

export const testimonials = [
  {
    quote:
      'SPECTRON let our operations team test a new monitoring use case without commissioning new hardware.',
    person: 'Pilot customer placeholder',
    role: 'Facility operations lead',
  },
  {
    quote:
      'The reusable controller and dashboard configuration model would reduce our maintenance effort across sites.',
    person: 'Advisor placeholder',
    role: 'IoT deployment consultant',
  },
  {
    quote:
      'A modular kit is exactly what small technical teams need when requirements keep changing in the field.',
    person: 'Beta user placeholder',
    role: 'Product engineering manager',
  },
]

export const pricing = [
  {
    name: 'Starter farm kit',
    price: 'Custom',
    description: 'For small growers, university trials, and first farm deployments.',
    features: ['1 reusable core', 'Starter sensor module', 'Dashboard setup', 'WhatsApp support'],
  },
  {
    name: 'Pilot estate kit',
    price: 'Custom',
    description: 'For tea estates, paddy support teams, and multi-site pilot rollouts.',
    features: ['Multi-device dashboard', 'Alert policies', 'Signed OTA updates', 'Role-based access'],
    highlighted: true,
  },
  {
    name: 'Agri platform',
    price: 'Custom',
    description: 'For cooperatives, exporters, and larger operations that need integration support and custom modules.',
    features: ['Custom sensor packs', 'API integration', 'Security review', 'Deployment onboarding'],
  },
]

export const faqs = [
  {
    question: 'What makes SPECTRON different from a normal farm sensor device?',
    answer:
      'Most devices are built for one fixed job. SPECTRON separates the reusable hardware core from the sensor module, so the same platform can support many Sri Lankan agriculture applications.',
  },
  {
    question: 'Do users need to rebuild firmware for each deployment?',
    answer:
      'No backend is included in this website, but the product concept is built around dashboard-configurable settings such as thresholds, sampling intervals, labels, and alert rules.',
  },
  {
    question: 'Which sensors can the platform support?',
    answer:
      'The concept supports modular sensor packs such as temperature, humidity, pressure, ultrasonic, odour/gas, light, motion, attendance, and other field-specific modules through a standardized adapter approach for farm operations.',
  },
  {
    question: 'How does SPECTRON handle field security?',
    answer:
      'The security model highlights encrypted transport, device certificates, mTLS, OAuth2/JWT user sessions, RBAC, ACLs, and signed OTA update delivery.',
  },
  {
    question: 'Is pricing final?',
    answer:
      'Pricing is intentionally shown as placeholders. The final model can be adjusted around starter farm kits, estate bundles, or platform partnerships.',
  },
]

export const shopStats = [
  { value: 'LK', label: 'Sri Lanka market', text: 'Created for local growers and agri teams.' },
  { value: '04', label: 'Bundle types', text: 'Starter, pilot, estate, and platform options.' },
  { value: 'සිංහල / தமிழ்', label: 'Regional support', text: 'Friendly enquiry flow for regional buyers.' },
  { value: '24/7', label: 'Inquiry ready', text: 'Clear contact flow for quotes and pilot requests.' },
]

export const productSpecs = [
  {
    icon: 'ShieldCheck',
    title: 'Secure product story',
    text: 'The product page emphasizes device identity, controlled updates, and protected transport.',
  },
  {
    icon: 'CircleGauge',
    title: 'Readable at a glance',
    text: 'The single hero image and short spec cards make the product easy to scan quickly for farm buyers.',
  },
  {
    icon: 'Box',
    title: 'Bundle-ready structure',
    text: 'Each page supports a simple ecommerce path from product detail to bundles and contact.',
  },
  {
    icon: 'Sparkles',
    title: 'Premium presentation',
    text: 'The design uses warm neutrals, stronger typography, and a cleaner product-first layout.',
  },
]

export const collections = [
  {
    name: 'Paddy starter',
    summary: 'Best for paddy field demos, early validation, and first-time buyers who need a compact setup.',
  },
  {
    name: 'Tea estate pilot',
    summary: 'Designed for tea estate field trials with enough room to compare performance across sites.',
  },
  {
    name: 'Greenhouse deployment',
    summary: 'Prepared for greenhouse rollouts where consistency, support, and maintenance matter.',
  },
  {
    name: 'Irrigation custom build',
    summary: 'A flexible option for buyers who want their own configuration, branding, or integration needs.',
  },
  {
    name: 'Agri education pack',
    summary: 'A polished option for university demos, thesis work, and farm training showcases.',
  },
  {
    name: 'Exporter pack',
    summary: 'Structured for larger teams that want a simple purchase path and a clean product story.',
  },
]

export const ecommerceFaqs = [
  {
    question: 'What is SPECTRON selling?',
    answer:
      'The storefront presents SPECTRON as a reusable hardware product with a simple path to starter, pilot, estate, and platform bundles.',
  },
  {
    question: 'Can buyers request a custom bundle?',
    answer:
      'Yes. The contact page is set up for quote requests, pilot orders, and custom build inquiries for Sri Lankan agriculture, with English plus Sinhala/Tamil-friendly support.',
  },
  {
    question: 'Why is there only one product image?',
    answer:
      'The layout intentionally reuses the available image in the hero and product sections so the storefront stays consistent and efficient.',
  },
  {
    question: 'How are orders handled?',
    answer:
      'Orders are handled through the contact and quote request flow, which keeps the storefront simple and easy to manage.',
  },
]
