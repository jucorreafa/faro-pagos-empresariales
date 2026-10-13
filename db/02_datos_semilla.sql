-- =====================================================================
-- FARO · Datos semilla  [SIMULADO]  (ejecutar DESPUÉS de 01_esquema.sql)
-- Las llaves de API NO están aquí: solo su huella sha256.
-- Las llaves reales las tiene el docente en un archivo privado.
-- =====================================================================

-- BANCO ANDINO SIMULADO ------------------------------------------------
insert into banco.clientes (id, nombre, tipo, equipo) values
  ('ANDESCAFE', 'Andes Café Exportadora S.A. (ficticia)', 'EMPRESA', null),
  ('PAPELERIA', 'Papelería Mitad del Mundo (ficticia)', 'EMPRESA', null),
  ('DEMO',      'Cuenta demo de clase', 'PERSONA', null),
  ('GARCIA', 'Empleado García', 'PERSONA', 'BILLETERA'),
  ('BOSQUEZ', 'Empleado Bosquez', 'PERSONA', 'BILLETERA'),
  ('CEVALLOS', 'Empleado Cevallos', 'PERSONA', 'BILLETERA'),
  ('CASTILLO', 'Empleado Castillo', 'PERSONA', 'NEXOCREDIT'),
  ('JIMENEZ', 'Empleado Jiménez', 'PERSONA', 'NEXOCREDIT'),
  ('GOMEZ', 'Empleado Gómez', 'PERSONA', 'REMESAS'),
  ('TASAMBAY', 'Empleado Tasambay', 'PERSONA', 'REMESAS'),
  ('FUENTES', 'Empleado Fuentes', 'PERSONA', 'AGROANTICIPO'),
  ('LOMAS', 'Empleado Lomas', 'PERSONA', 'AGROANTICIPO');

insert into banco.cuentas (numero, cliente_id, tipo, saldo) values
  ('2200000001', 'ANDESCAFE', 'CORRIENTE', 250000.00),
  ('2200002001', 'PAPELERIA', 'CORRIENTE', 3200.00),
  ('2200009999', 'DEMO',      'AHORROS',   0.00),
  ('2200001001', 'GARCIA', 'AHORROS', 25.00),
  ('2200001002', 'BOSQUEZ', 'AHORROS', 25.00),
  ('2200001003', 'CEVALLOS', 'AHORROS', 25.00),
  ('2200001004', 'CASTILLO', 'AHORROS', 25.00),
  ('2200001005', 'JIMENEZ', 'AHORROS', 25.00),
  ('2200001006', 'GOMEZ', 'AHORROS', 25.00),
  ('2200001007', 'TASAMBAY', 'AHORROS', 25.00),
  ('2200001008', 'FUENTES', 'AHORROS', 25.00),
  ('2200001009', 'LOMAS', 'AHORROS', 25.00);

-- BCE SIMULADO --------------------------------------------------------
insert into bce.participantes (codigo, nombre, tipo, api_key_hash, saldo_liquidacion) values
  ('BAS', 'Banco Andino Simulado', 'BANCO', '57819cdc32b8a88346740288c8301dc4d3fda524e6d4fd5953bdf6e7520ed754', 5000000.00),
  ('FARO', 'Faro Pagos Empresariales', 'ENTIDAD_PAGO', 'fbc61e1a19c46d192f83d74fdba465b047dc962c3fe042502b53a6b300b3fb01', 1000000.00),
  ('BILLETERA', 'Equipo Billetera Móvil', 'EQUIPO_CURSO', '08ad867800f479d39b239b349af8064f21e600d38642895ec1a0c9a90749fece', 100000.00),
  ('NEXOCREDIT', 'Equipo NexoCredit', 'EQUIPO_CURSO', '46213195384c66b5ae5db37578304af1fb86f4adb5171bbeb359524b1a0c4d96', 100000.00),
  ('REMESAS', 'Equipo Remesas', 'EQUIPO_CURSO', 'a7b05e606f56a5d356be66c04d382b612bc476010f46a22366e6e7e61c759466', 100000.00),
  ('AGROANTICIPO', 'Equipo Anticipo Agrícola', 'EQUIPO_CURSO', 'e3bf9172c7df2e457ae236a778b518c1999516e345204e1191fbba2734fc48fb', 100000.00);

-- FARO -----------------------------------------------------------------
insert into faro.empresas (id, nombre, ruc, banco, cuenta) values
  ('ANDESCAFE', 'Andes Café Exportadora S.A.', '1799999999001', 'BAS', '2200000001');

insert into faro.beneficiarios (id, empresa_id, nombre, tipo, banco, cuenta, equipo, sueldo) values
  ('EMP-GARCIA', 'ANDESCAFE', 'Empleado García', 'EMPLEADO', 'BAS', '2200001001', 'BILLETERA', 1150.00),
  ('EMP-BOSQUEZ', 'ANDESCAFE', 'Empleado Bosquez', 'EMPLEADO', 'BAS', '2200001002', 'BILLETERA', 980.00),
  ('EMP-CEVALLOS', 'ANDESCAFE', 'Empleado Cevallos', 'EMPLEADO', 'BAS', '2200001003', 'BILLETERA', 1040.00),
  ('EMP-CASTILLO', 'ANDESCAFE', 'Empleado Castillo', 'EMPLEADO', 'BAS', '2200001004', 'NEXOCREDIT', 1210.00),
  ('EMP-JIMENEZ', 'ANDESCAFE', 'Empleado Jiménez', 'EMPLEADO', 'BAS', '2200001005', 'NEXOCREDIT', 890.00),
  ('EMP-GOMEZ', 'ANDESCAFE', 'Empleado Gómez', 'EMPLEADO', 'BAS', '2200001006', 'REMESAS', 1075.00),
  ('EMP-TASAMBAY', 'ANDESCAFE', 'Empleado Tasambay', 'EMPLEADO', 'BAS', '2200001007', 'REMESAS', 930.00),
  ('EMP-FUENTES', 'ANDESCAFE', 'Empleado Fuentes', 'EMPLEADO', 'BAS', '2200001008', 'AGROANTICIPO', 1120.00),
  ('EMP-LOMAS', 'ANDESCAFE', 'Empleado Lomas', 'EMPLEADO', 'BAS', '2200001009', 'AGROANTICIPO', 1005.00),
  ('PRV-PAPELERIA', 'ANDESCAFE', 'Papelería Mitad del Mundo', 'PROVEEDOR', 'BAS', '2200002001', null, null),
  ('PRV-DEMO', 'ANDESCAFE', 'Cuenta demo de clase', 'PROVEEDOR', 'BAS', '2200009999', null, null),
  ('PRV-BILLETERA', 'ANDESCAFE', 'Servicios del equipo Billetera Móvil', 'PROVEEDOR', 'BILLETERA', 'BILLETERA-0001', 'BILLETERA', null),
  ('PRV-NEXOCREDIT', 'ANDESCAFE', 'Servicios del equipo NexoCredit', 'PROVEEDOR', 'NEXOCREDIT', 'NEXOCREDIT-0001', 'NEXOCREDIT', null),
  ('PRV-REMESAS', 'ANDESCAFE', 'Servicios del equipo Remesas', 'PROVEEDOR', 'REMESAS', 'REMESAS-0001', 'REMESAS', null),
  ('PRV-AGROANTICIPO', 'ANDESCAFE', 'Servicios del equipo Anticipo Agrícola', 'PROVEEDOR', 'AGROANTICIPO', 'AGROANTICIPO-0001', 'AGROANTICIPO', null);
