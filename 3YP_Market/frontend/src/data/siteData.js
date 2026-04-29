// Centralized copy and section data keeps the React components focused on layout.
export const navigation = [
  { label: 'Problem', href: '#problem' },
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Security', href: '#security' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export const heroStats = [
  { value: '1', label: 'Reusable hardware core' },
  { value: '6+', label: 'Sensor categories' },
  { value: 'OTA', label: 'Signed update path' },
]

export const problemPoints = [
  'Single-purpose devices force teams to buy new hardware for every sensing task.',
  'Firmware changes often require technical rebuilds, reflashing, and repeated field visits.',
  'Fragmented dashboards make monitoring, alerts, battery state, and access control harder to scale.',
]

export const solutionPoints = [
  'One standardized adapter accepts multiple sensor modules for different deployments.',
  'Firmware settings and device behavior are configured through a web dashboard.',
  'Secure cloud connectivity, real-time alerts, and signed OTA updates support field use.',
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
    text: 'Devices connect into a dashboard, event pipeline, and storage layer built for temperature, humidity, pressure, ultrasonic, gas, and occupancy sensing across many sites.',
  },
]

export const features = [
  {
    icon: 'Puzzle',
    title: 'Modular sensor compatibility',
    text: 'Attach temperature, humidity, pressure, ultrasonic, odour/gas, light, motion, attendance, or custom modules to the same reusable device platform.',
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
    text: 'Track live device state, sensor readings, alerts, site grouping, and battery health in one interface.',
  },
  {
    icon: 'BellRing',
    title: 'Real-time alerts',
    text: 'Notify operators when readings cross limits, devices lose connectivity, or battery drops below policy.',
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
    name: 'Temperature + Humidity',
    category: 'Environment',
    summary: 'Room comfort, greenhouse climate, cold-room, storage, archive, and incubation monitoring.',
    useCases: ['room comfort', 'greenhouse climate', 'cold-room', 'medicine storage', 'archive preservation', 'museum preservation', 'incubator monitoring'],
  },
  {
    icon: 'Factory',
    name: 'Pressure',
    category: 'Trend monitoring',
    summary: 'Barometric, sealed-room drift, ventilation/filter condition, and process pressure trends.',
    useCases: ['barometric trend', 'sealed-room drift', 'ventilation filter trend', 'tank pressure trend', 'line pressure trend'],
  },
  {
    icon: 'Warehouse',
    name: 'Ultrasonic Distance',
    category: 'Level / occupancy',
    summary: 'Bin fill level, water tank level, silo/container level, queue buildup, and simple occupancy.',
    useCases: ['garbage bin fill level', 'water tank level', 'silo level', 'parking slot occupancy', 'queue buildup', 'classroom seat presence'],
  },
  {
    icon: 'BellRing',
    name: 'Odour / Gas',
    category: 'Air safety',
    summary: 'Odour escalation, restroom cleaning need, waste-room smell alert, and calibrated gas warnings.',
    useCases: ['garbage odor', 'restroom cleaning need', 'kitchen waste room smell', 'sewer odor alert', 'gas leak', 'unsafe air warning'],
  },
  {
    icon: 'MonitorSmartphone',
    name: 'Light',
    category: 'Environment',
    summary: 'Greenhouse daylight, classroom brightness, and site lighting visibility.',
    useCases: ['greenhouse', 'classroom', 'lighting'],
  },
  {
    icon: 'RadioTower',
    name: 'Presence / Motion',
    category: 'Occupancy',
    summary: 'Class attendance, doorway presence, occupancy, and security-aware motion sensing.',
    useCases: ['attendance', 'doorway presence', 'occupancy', 'security'],
  },
]

export const workflow = [
  {
    step: '01',
    title: 'Choose a sensor module',
    text: 'Select the sensor pack for greenhouse, cold storage, pressure trend, ultrasonic level, odour/gas, attendance, motion, light, or a custom use case.',
  },
  {
    step: '02',
    title: 'Attach it to the core',
    text: 'Connect the module to the standardized hardware core with the battery and communication board already in place.',
  },
  {
    step: '03',
    title: 'Configure in the web app',
    text: 'Set sampling behavior, alert thresholds, data labels, location, access roles, and update policy.',
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
    text: 'Temperature, humidity, pressure trend, light, and gas monitoring for controlled agriculture.',
  },
  {
    icon: 'Snowflake',
    title: 'Cold storage',
    text: 'Temperature, humidity, and door-state visibility for perishable inventory and chain-of-custody checks.',
  },
  {
    icon: 'IdCard',
    title: 'Class attendance',
    text: 'Configurable presence or access sensing using the same platform primitives.',
  },
  {
    icon: 'Building2',
    title: 'Facilities',
    text: 'Motion, air quality, utility, and asset condition monitoring across multiple sites.',
  },
  {
    icon: 'Warehouse',
    title: 'Warehousing',
    text: 'Ambient, pressure, occupancy, fill-level, and storage-condition signals for operational visibility.',
  },
  {
    icon: 'Factory',
    title: 'Industrial pilots',
    text: 'Reusable field units for fast sensing experiments before committing to custom hardware, including ultrasonic and odour alerts.',
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
    name: 'Prototype',
    price: 'Custom',
    description: 'For academic pilots and proof-of-concept monitoring.',
    features: ['1 reusable core', 'Starter sensor module', 'Dashboard sandbox', 'Email support'],
  },
  {
    name: 'Deployment',
    price: 'Custom',
    description: 'For teams rolling out multiple devices across real sites.',
    features: ['Multi-device dashboard', 'Alert policies', 'Signed OTA updates', 'Role-based access'],
    highlighted: true,
  },
  {
    name: 'Platform',
    price: 'Custom',
    description: 'For organizations that need integration support and custom modules.',
    features: ['Custom sensor packs', 'API integration', 'Security review', 'Deployment onboarding'],
  },
]

export const faqs = [
  {
    question: 'What makes SPECTRON different from a normal IoT sensor device?',
    answer:
      'Most IoT devices are built for one fixed job. SPECTRON separates the reusable hardware core from the sensor module, so the same platform can support many monitoring applications.',
  },
  {
    question: 'Do users need to rebuild firmware for each deployment?',
    answer:
      'No backend is included in this website, but the product concept is built around dashboard-configurable settings such as thresholds, sampling intervals, labels, and alert rules.',
  },
  {
    question: 'Which sensors can the platform support?',
    answer:
      'The concept supports modular sensor packs such as temperature, humidity, pressure, ultrasonic, odour/gas, light, motion, attendance, and other field-specific modules through a standardized adapter approach.',
  },
  {
    question: 'How does SPECTRON handle field security?',
    answer:
      'The security model highlights encrypted transport, device certificates, mTLS, OAuth2/JWT user sessions, RBAC, ACLs, and signed OTA update delivery.',
  },
  {
    question: 'Is pricing final?',
    answer:
      'Pricing is intentionally shown as placeholders. The final model can be adjusted around prototype kits, deployment bundles, or platform partnerships.',
  },
]
