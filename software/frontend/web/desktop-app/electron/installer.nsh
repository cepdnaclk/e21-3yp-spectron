!macro customInit
  System::Call 'Kernel32::SetEnvironmentVariable(t, p)i ("ELECTRON_RUN_AS_NODE", 0).r0'
!macroend
