'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { runMigrations } = require('../config/migrations');

const FORCE = process.argv.includes('--force');
const DEMO_PREFIX = 'DEMO-VET';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'DemoVet123!';

const clinics = [
    {
        slug: 'vetcare-tegucigalpa',
        name: 'VetCare Tegucigalpa',
        city: 'Tegucigalpa',
        address: 'Colonia Palmira, Avenida Republica de Chile, Tegucigalpa',
        phone: '+504 2232-1840',
        email: 'contacto@vetcaretegucigalpa.demo',
        vets: [
            ['0801198800147', 'Ana Lucia', 'Martinez', 'ana.martinez@vetcaretegucigalpa.demo'],
            ['0801199000821', 'Carlos Roberto', 'Mejia', 'carlos.mejia@vetcaretegucigalpa.demo'],
        ],
    },
    {
        slug: 'clinica-veterinaria-sula',
        name: 'Clinica Veterinaria Sula',
        city: 'San Pedro Sula',
        address: 'Barrio Rio de Piedras, 7 Calle, San Pedro Sula',
        phone: '+504 2550-3185',
        email: 'recepcion@vetsula.demo',
        vets: [
            ['0501198700915', 'Maria Fernanda', 'Lopez', 'maria.lopez@vetsula.demo'],
            ['0501199100332', 'Jorge Alberto', 'Castro', 'jorge.castro@vetsula.demo'],
        ],
    },
    {
        slug: 'petsalud-la-ceiba',
        name: 'PetSalud La Ceiba',
        city: 'La Ceiba',
        address: 'Avenida San Isidro, Barrio El Centro, La Ceiba',
        phone: '+504 2442-7012',
        email: 'info@petsaludlaceiba.demo',
        vets: [
            ['0101198900458', 'Sofia Isabel', 'Rivera', 'sofia.rivera@petsaludlaceiba.demo'],
            ['0101198500783', 'Hector Daniel', 'Pineda', 'hector.pineda@petsaludlaceiba.demo'],
        ],
    },
];

const tutorFirstNames = ['Luis', 'Andrea', 'Jose', 'Gabriela', 'Fernando', 'Paola', 'Ricardo', 'Daniela', 'Mario', 'Sofia', 'Cesar', 'Valeria', 'Oscar', 'Karla', 'Miguel', 'Marcela', 'Roberto', 'Claudia', 'Hugo', 'Natalia'];
const tutorLastNames = ['Hernandez', 'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Mejia', 'Castro', 'Rivera', 'Cruz', 'Pineda', 'Reyes', 'Flores', 'Aguilar', 'Valladares', 'Alvarado'];
const petNames = ['Luna', 'Max', 'Maya', 'Rocky', 'Nala', 'Toby', 'Kira', 'Bruno', 'Coco', 'Milo', 'Bella', 'Simba', 'Chispa', 'Duke', 'Mia', 'Zeus', 'Canela', 'Thor', 'Lola', 'Bobby'];
const petProfiles = [
    ['Canino', 'Labrador Retriever', 24, 'Negro', 28.4],
    ['Canino', 'French Poodle', 60, 'Blanco', 6.2],
    ['Canino', 'Pastor Aleman', 36, 'Sable', 31.8],
    ['Canino', 'Schnauzer Miniatura', 48, 'Sal y pimienta', 8.7],
    ['Canino', 'Criollo hondureno', 30, 'Cafe', 16.5],
    ['Felino', 'Domestico de pelo corto', 42, 'Atigrado', 4.3],
    ['Felino', 'Siames', 50, 'Crema', 4.9],
    ['Felino', 'Persa', 28, 'Gris', 5.1],
    ['Ave', 'Periquito australiano', 12, 'Verde', 0.04],
    ['Conejo', 'Mini Rex', 18, 'Blanco y cafe', 1.8],
];
const diagnoses = ['Gastroenteritis leve', 'Otitis externa', 'Dermatitis alergica', 'Control preventivo saludable', 'Enfermedad periodontal grado I', 'Parasitosis intestinal', 'Conjuntivitis leve', 'Herida superficial', 'Obesidad moderada', 'Infeccion respiratoria alta'];
const treatments = ['Dieta blanda y probiotico por 5 dias', 'Limpieza auricular y gotas oticas', 'Antihistaminico y control de pulgas', 'Continuar plan preventivo', 'Profilaxis dental programada', 'Desparasitante oral segun peso', 'Colirio lubricante cada 8 horas', 'Curacion local y antibiotico topico', 'Plan nutricional hipocalorico', 'Nebulizacion y control en 72 horas'];
const vaccineNames = ['Nobivac DHPPi', 'Nobivac Rabies', 'Nobivac Lepto', 'Felocell 3', 'Purevax Rabies', 'Bronchicine CAe', 'Puppy DP'];

const services = [
    ['CONS-GEN', 'Consulta general', 'Consulta', 30, 450],
    ['CONS-EMER', 'Consulta de emergencia', 'Emergencia', 45, 850],
    ['VAC-CAN', 'Aplicacion de vacuna canina', 'Vacunacion', 20, 520],
    ['VAC-FEL', 'Aplicacion de vacuna felina', 'Vacunacion', 20, 540],
    ['DESP-INT', 'Desparasitacion interna', 'Preventivo', 15, 280],
    ['LAB-HEM', 'Hemograma completo', 'Laboratorio', 30, 650],
    ['LAB-COPRO', 'Coproparasitologico', 'Laboratorio', 25, 380],
    ['CIR-EST', 'Esterilizacion programada', 'Cirugia', 120, 2400],
    ['GRO-BAS', 'Bano y corte basico', 'Grooming', 60, 700],
    ['HOSP-DIA', 'Hospitalizacion diurna', 'Hospitalizacion', 480, 1200],
];

const products = [
    ['VAC-DHPP', 'Vacuna multiple canina DHPPi', 'Nobivac DHPPi', '1 dosis', 'Vacuna', 180, 520],
    ['VAC-RAB', 'Vacuna antirrabica', 'Nobivac Rabies', '1 dosis', 'Vacuna', 95, 350],
    ['VAC-FVRCP', 'Vacuna triple felina FVRCP', 'Felocell 3', '1 dosis', 'Vacuna', 210, 540],
    ['MED-AMOX', 'Amoxicilina con acido clavulanico', 'Clavamox', '250 mg', 'Medicamento', 18, 45],
    ['MED-MELOX', 'Meloxicam veterinario', 'Metacam', '1.5 mg/ml', 'Medicamento', 320, 560],
    ['MED-FIP', 'Fipronil spray', 'Frontline Spray', '250 ml', 'Medicamento', 410, 780],
    ['INS-GASA', 'Gasa esteril veterinaria', 'Gasa Esteril', 'Paquete x10', 'Insumo', 25, 75],
    ['ALIM-RENAL', 'Alimento renal canino', 'Royal Canin Renal', '2 kg', 'Alimento', 620, 980],
];

function pick(list, index) {
    return list[index % list.length];
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function addHours(date, hours) {
    const d = new Date(date);
    d.setHours(d.getHours() + hours);
    return d;
}

function addMinutes(date, minutes) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + minutes);
    return d;
}

function money(n) {
    return Number(n.toFixed(2));
}

async function upsertTenant(client, clinic) {
    const { rows } = await client.query(`
        INSERT INTO tenants (slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento)
        VALUES ($1, $2, 'enterprise', 'activo', 4, 35, 8000, NOW() + INTERVAL '365 days')
        ON CONFLICT (slug) DO UPDATE SET
            nombre_empresa = EXCLUDED.nombre_empresa,
            plan = EXCLUDED.plan,
            estado = EXCLUDED.estado,
            updated_at = NOW()
        RETURNING id
    `, [clinic.slug, clinic.name]);
    return rows[0].id;
}

async function ensureRole(client, tenantId, name) {
    const existing = await client.query('SELECT idrol FROM roles WHERE tenant_id=$1 AND LOWER(nombre)=LOWER($2) LIMIT 1', [tenantId, name]);
    if (existing.rows[0]) return existing.rows[0].idrol;
    const created = await client.query('INSERT INTO roles (nombre, estado, tenant_id) VALUES ($1, $2, $3) RETURNING idrol', [name, 'Activo', tenantId]);
    return created.rows[0].idrol;
}

async function ensureUser(client, tenantId, user, roleId, branchId) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const { rows } = await client.query(`
        INSERT INTO usuarios (usuario, password, identidad, idrol, id_sucursal, estado, tenant_id, requires_password_change)
        VALUES ($1, $2, $3, $4, $5, 'Activo', $6, FALSE)
        ON CONFLICT (usuario) DO UPDATE SET
            idrol=EXCLUDED.idrol,
            id_sucursal=EXCLUDED.id_sucursal,
            tenant_id=EXCLUDED.tenant_id,
            estado='Activo'
        RETURNING codUsuario
    `, [user.email, hash, user.identity, roleId, branchId, tenantId]);
    return rows[0].codusuario;
}

async function seedClinic(client, clinic, clinicIndex) {
    const tenantId = await upsertTenant(client, clinic);
    const counts = {};

    const branch = await client.query(`
        INSERT INTO sucursales (codigo, nombre, direccion, telefono, ciudad, estado, tenant_id)
        VALUES ($1, $2, $3, $4, $5, 'Activa', $6)
        ON CONFLICT DO NOTHING
        RETURNING id_sucursal
    `, [`DVS${clinicIndex + 1}`, 'Sucursal Principal', clinic.address, clinic.phone, clinic.city, tenantId]);
    let branchId = branch.rows[0]?.id_sucursal;
    if (!branchId) {
        const existing = await client.query('SELECT id_sucursal FROM sucursales WHERE tenant_id=$1 ORDER BY id_sucursal LIMIT 1', [tenantId]);
        branchId = existing.rows[0].id_sucursal;
    }
    counts.sucursales = 1;

    await client.query(`
        INSERT INTO configuracion (tenant_id, nombreempresa, direccion, telefono, correo, isv, mensajefinal)
        VALUES ($1, $2, $3, $4, $5, 15.00, 'Gracias por confiar en nuestro equipo veterinario.')
        ON CONFLICT (tenant_id) DO UPDATE SET
            nombreempresa=EXCLUDED.nombreempresa,
            direccion=EXCLUDED.direccion,
            telefono=EXCLUDED.telefono,
            correo=EXCLUDED.correo
    `, [tenantId, clinic.name, clinic.address, clinic.phone, clinic.email]);
    counts.configuracion = 1;

    const adminRole = await ensureRole(client, tenantId, 'Administrador');
    const vetRole = await ensureRole(client, tenantId, 'Veterinario');
    const recepRole = await ensureRole(client, tenantId, 'Recepcionista');
    await client.query(`
        INSERT INTO rol_permisos (idRol, idPermiso)
        SELECT $1, idPermiso FROM permisos
        ON CONFLICT DO NOTHING
    `, [adminRole]);
    await client.query(`
        INSERT INTO rol_permisos (idRol, idPermiso)
        SELECT $1, idPermiso FROM permisos
        WHERE idPermiso IN ('VER_PACIENTES','GESTIONAR_PACIENTES','VER_CITAS','GESTIONAR_CITAS','VER_EXPEDIENTE','EDITAR_EXPEDIENTE','VER_VACUNAS','GESTIONAR_VACUNAS','VER_SERVICIOS_VET','VER_INVENTARIO')
        ON CONFLICT DO NOTHING
    `, [vetRole]);
    await client.query(`
        INSERT INTO rol_permisos (idRol, idPermiso)
        SELECT $1, idPermiso FROM permisos
        WHERE idPermiso IN ('VER_PACIENTES','GESTIONAR_PACIENTES','VER_CITAS','GESTIONAR_CITAS','VER_CLIENTES','VER_POS','VER_CAJA')
        ON CONFLICT DO NOTHING
    `, [recepRole]);
    counts.roles = 3;

    const vetUserIds = [];
    for (const vet of clinic.vets) {
        await client.query(`
            INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, correo, estado, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,'Activo',$7)
            ON CONFLICT DO NOTHING
        `, [vet[0], vet[1], vet[2], clinic.address, clinic.phone, vet[3], tenantId]);
        await client.query(
            'UPDATE empleado SET correo=$1, telefono=$2, tenant_id=$3 WHERE identidad=$4',
            [vet[3], clinic.phone, tenantId, vet[0]]
        );
        const cod = await ensureUser(client, tenantId, { identity: vet[0], email: vet[3] }, vetRole, branchId);
        vetUserIds.push(String(cod));
    }
    const receptionIdentity = `${clinicIndex + 1}999${String(clinicIndex + 1).padStart(9, '0')}`;
    const receptionEmail = `recepcion.${clinic.slug}@demo.local`;
    await client.query(`
        INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, correo, estado, tenant_id)
        VALUES ($1,'Recepcion','Demo',$2,$3,$4,'Activo',$5)
        ON CONFLICT DO NOTHING
    `, [receptionIdentity, clinic.address, clinic.phone, receptionEmail, tenantId]);
    await client.query(
        'UPDATE empleado SET correo=$1, telefono=$2, tenant_id=$3 WHERE identidad=$4',
        [receptionEmail, clinic.phone, tenantId, receptionIdentity]
    );
    await ensureUser(client, tenantId, { identity: receptionIdentity, email: receptionEmail }, recepRole, branchId);
    counts.empleados = 3;
    counts.usuarios = 3;

    await client.query(`
        INSERT INTO caja (idCaja, nombre, estado, id_sucursal, tenant_id)
        VALUES ($1, 'Caja Principal', 'Activo', $2, $3)
        ON CONFLICT (idCaja) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, id_sucursal=EXCLUDED.id_sucursal
    `, [`${DEMO_PREFIX}-CAJA-${clinicIndex + 1}`, branchId, tenantId]);
    await client.query(`
        INSERT INTO arqueo (idArqueo, idCaja, idUsuario, montoInicial, estado, tenant_id)
        VALUES ($1, $2, $3, 2000, 'Activo', $4)
        ON CONFLICT (idArqueo) DO UPDATE SET estado='Activo', tenant_id=EXCLUDED.tenant_id
    `, [`${DEMO_PREFIX}-ARQ-${clinicIndex + 1}`, `${DEMO_PREFIX}-CAJA-${clinicIndex + 1}`, receptionEmail, tenantId]);
    counts.caja = 2;

    const category = await client.query(`
        INSERT INTO categorias_terapeuticas (nombre, descripcion, activo, tenant_id)
        VALUES ('Veterinaria preventiva', 'Medicamentos, vacunas e insumos veterinarios', TRUE, $1)
        RETURNING id_categoria
    `, [tenantId]);
    const form = await client.query(`
        INSERT INTO formas_farmaceuticas (nombre, unidad_base, activo, tenant_id)
        VALUES ('Dosis veterinaria', 'dosis', TRUE, $1)
        RETURNING id_forma
    `, [tenantId]);

    const productCodes = [];
    const vaccineProductCodes = [];
    let productCount = 0;
    for (const [baseCode, generic, commercial, concentration, type, cost, sale] of products) {
        const code = `${baseCode}-${clinicIndex + 1}`;
        await client.query(`
            INSERT INTO medicamentos (
                codigo,nombre_generico,nombre_comercial,concentracion,id_forma,via_administracion,id_categoria,
                indicaciones,advertencias,laboratorio,pais_origen,requiere_receta,tipo_isv,precio_costo_base,
                margen_ganancia,stock_minimo,punto_reorden,condicion_almacenamiento,activo,tenant_id,
                tipo_producto,especies_permitidas,dosis_recomendada,unidad_dosis,intervalo_dosis
            ) VALUES ($1,$2,$3,$4,$5,'Veterinaria',$6,$7,$8,$9,'Honduras',$10,'exento',$11,35,10,20,$12,TRUE,$13,$14,$15,$16,$17,$18)
            ON CONFLICT (codigo) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, tipo_producto=EXCLUDED.tipo_producto
        `, [
            code, generic, commercial, concentration, form.rows[0].id_forma, category.rows[0].id_categoria,
            type === 'Vacuna' ? 'Medicina preventiva veterinaria' : 'Uso clinico veterinario',
            'Usar bajo criterio de medico veterinario.', commercial, type === 'Medicamento',
            cost, type === 'Vacuna' ? 'Refrigerado 2-8 C' : 'Temperatura ambiente',
            tenantId, type, type === 'Vacuna' ? 'Canino,Felino' : 'Canino,Felino',
            type === 'Vacuna' ? '1 dosis' : 'Segun peso y criterio veterinario', type === 'Vacuna' ? 'dosis' : 'mg/kg',
            type === 'Vacuna' ? 'Anual o segun protocolo' : 'Segun indicacion'
        ]);
        const pres = await client.query(`
            INSERT INTO presentaciones_venta (id_medicamento,nombre,factor_conversion,precio_venta,es_unidad_venta,activo,tenant_id)
            VALUES ($1,$2,1,$3,TRUE,TRUE,$4)
            ON CONFLICT (id_medicamento, nombre) DO UPDATE SET precio_venta=EXCLUDED.precio_venta, tenant_id=EXCLUDED.tenant_id
            RETURNING id_presentacion
        `, [code, type === 'Alimento' ? 'Bolsa' : 'Unidad', sale, tenantId]);
        await client.query(`
            INSERT INTO lotes_medicamento (
                id_medicamento, numero_lote, fecha_vencimiento_display, fecha_vencimiento, cantidad_inicial,
                cantidad_actual, precio_compra_unitario, id_sucursal, id_proveedor, estado, notas, tenant_id
            ) VALUES ($1,$2,$3,$4,120,120,$5,$6,NULL,'Activo','Lote demo FEFO',$7)
            ON CONFLICT (id_medicamento, numero_lote, id_sucursal) DO UPDATE SET cantidad_actual=EXCLUDED.cantidad_actual, tenant_id=EXCLUDED.tenant_id
        `, [code, `${DEMO_PREFIX}-LOT-${clinicIndex + 1}-${baseCode}`, '12/2027', '2027-12-01', cost, branchId, tenantId]);
        productCodes.push({ code, sale, presId: pres.rows[0].id_presentacion, type });
        if (type === 'Vacuna') vaccineProductCodes.push(code);
        productCount += 3;
    }
    counts.inventario = productCount + 2;

    let serviceCount = 0;
    for (const [code, name, cat, duration, price] of services) {
        await client.query(`
            INSERT INTO servicios_veterinarios (tenant_id,codigo,nombre,categoria,descripcion,duracion_minutos,precio,tipo_isv,requiere_paciente)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'exento',TRUE)
            ON CONFLICT (tenant_id, nombre) DO UPDATE SET precio=EXCLUDED.precio, codigo=EXCLUDED.codigo, activo=TRUE
        `, [tenantId, `${code}-${clinicIndex + 1}`, name, cat, `${name} para pacientes veterinarios`, duration, price]);
        serviceCount += 1;
    }
    counts.servicios = serviceCount;

    const typeRows = await client.query('SELECT id_tipo_cita, nombre FROM tipos_cita WHERE tenant_id=$1 ORDER BY id_tipo_cita', [tenantId]);
    const serviceRows = await client.query('SELECT id_servicio, nombre, precio FROM servicios_veterinarios WHERE tenant_id=$1 ORDER BY id_servicio', [tenantId]);

    const tutorIds = [];
    for (let i = 0; i < 20; i += 1) {
        const first = pick(tutorFirstNames, i + clinicIndex);
        const last = pick(tutorLastNames, i * 2 + clinicIndex);
        const identity = `${DEMO_PREFIX.replace('-', '')}${clinicIndex + 1}${String(i + 1).padStart(4, '0')}`;
        await client.query(`
            INSERT INTO clientes (identidad,nombre,apellido,direccion,telefono,correo,fechaCreacion,tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
            ON CONFLICT DO NOTHING
        `, [
            identity, first, last, `${pick(['Colonia Kennedy', 'Barrio El Centro', 'Residencial Los Alamos', 'Colonia Universidad', 'Barrio La Isla'], i)}, ${clinic.city}`,
            `+504 ${String(90000000 + clinicIndex * 100000 + i * 137).slice(0, 8)}`,
            `${first.toLowerCase()}.${last.toLowerCase()}.${clinicIndex + 1}${i}@demo.local`,
            tenantId
        ]);
        await client.query(
            'UPDATE clientes SET telefono=$1, correo=$2, tenant_id=$3 WHERE identidad=$4',
            [
                `+504 ${String(90000000 + clinicIndex * 100000 + i * 137).slice(0, 8)}`,
                `${first.toLowerCase()}.${last.toLowerCase()}.${clinicIndex + 1}${i}@demo.local`,
                tenantId,
                identity
            ]
        );
        tutorIds.push(identity);
    }
    counts.tutores = tutorIds.length;

    const patientIds = [];
    for (let i = 0; i < 40; i += 1) {
        const profile = pick(petProfiles, i + clinicIndex);
        const birth = addDays(new Date(), -(profile[2] * 30 + i * 4));
        const patient = await client.query(`
            INSERT INTO pacientes (
                tenant_id,id_tutor,nombre,especie,raza,sexo,color,fecha_nacimiento,fecha_nacimiento_estimada,
                peso_actual,microchip,estado_reproductivo,alergias,condiciones_cronicas,estado
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$10,$11,$12,$13,'Activo')
            RETURNING id_paciente
        `, [
            tenantId, pick(tutorIds, i), pick(petNames, i + clinicIndex), profile[0], profile[1],
            i % 2 === 0 ? 'Macho' : 'Hembra', profile[3], birth, money(profile[4] + (i % 5) * 0.35),
            `${DEMO_PREFIX}-${clinicIndex + 1}-${String(i + 1).padStart(5, '0')}`,
            i % 3 === 0 ? 'Esterilizado' : 'Entero',
            i % 11 === 0 ? 'Sensibilidad a pollo' : null,
            i % 13 === 0 ? 'Dermatitis recurrente' : null
        ]);
        patientIds.push({ id: patient.rows[0].id_paciente, tutor: pick(tutorIds, i), profile });
        await client.query(`
            INSERT INTO paciente_pesos (tenant_id,id_paciente,peso,registrado_por,notas)
            VALUES ($1,$2,$3,$4,'Peso inicial demo')
        `, [tenantId, patient.rows[0].id_paciente, money(profile[4] + (i % 5) * 0.35), pick(vetUserIds, i)]);
    }
    counts.pacientes = patientIds.length;
    counts.pesos = patientIds.length;

    let appointmentCount = 0;
    for (let i = 0; i < 50; i += 1) {
        const patient = pick(patientIds, i);
        const start = addHours(new Date(), 24 + i * 3 + clinicIndex);
        const end = addMinutes(start, 30);
        await client.query(`
            INSERT INTO citas (tenant_id,id_paciente,id_tutor,id_tipo_cita,fecha_inicio,fecha_fin,id_veterinario,id_sucursal,sala_recurso,estado,motivo,notas,creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Cita demo programada',$12)
        `, [
            tenantId, patient.id, patient.tutor, pick(typeRows.rows, i)?.id_tipo_cita || null,
            start, end, pick(vetUserIds, i), branchId, `Consultorio ${(i % 3) + 1}`,
            pick(['Programada', 'Confirmada', 'En espera'], i),
            pick(['Consulta general', 'Vacunacion anual', 'Control de piel', 'Revision dental', 'Desparasitacion'], i),
            receptionEmail
        ]);
        appointmentCount += 1;
    }
    counts.citas = appointmentCount;

    let clinicalCount = 0;
    for (let i = 0; i < 25; i += 1) {
        const patient = pick(patientIds, i * 2);
        const diag = pick(diagnoses, i);
        const treatment = pick(treatments, i);
        const consult = await client.query(`
            INSERT INTO consultas (
                tenant_id,id_paciente,id_tutor,id_veterinario,fecha,motivo,subjetivo,objetivo,evaluacion,plan,
                peso,temperatura,frecuencia_cardiaca,frecuencia_respiratoria,condicion_corporal,notas_alta,estado
            ) VALUES ($1,$2,$3,$4,NOW() - ($5 || ' days')::interval,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Cerrada')
            RETURNING id_consulta
        `, [
            tenantId, patient.id, patient.tutor, pick(vetUserIds, i), i + 1,
            pick(['Consulta por decaimiento', 'Control preventivo', 'Revision por prurito', 'Vacunacion y chequeo'], i),
            'Tutor reporta apetito variable y actividad ligeramente disminuida.',
            'Paciente alerta, mucosas rosadas, hidratacion adecuada.',
            diag,
            treatment,
            money(patient.profile[4] + (i % 4) * 0.25),
            money(38.1 + (i % 5) * 0.1),
            82 + (i % 30),
            22 + (i % 12),
            pick(['3/5', '4/5', '5/9'], i),
            'Se explican signos de alarma y control segun evolucion.'
        ]);
        await client.query('INSERT INTO consulta_diagnosticos (tenant_id,id_consulta,diagnostico,codigo,notas) VALUES ($1,$2,$3,$4,$5)', [tenantId, consult.rows[0].id_consulta, diag, `DX-${String(i + 1).padStart(3, '0')}`, 'Diagnostico presuntivo demo']);
        await client.query('INSERT INTO consulta_tratamientos (tenant_id,id_consulta,descripcion,id_medicamento,dosis,frecuencia,duracion,instrucciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [tenantId, consult.rows[0].id_consulta, treatment, pick(productCodes, i).code, 'Segun peso', 'Cada 12 horas', '5 dias', 'Administrar con alimento si aplica']);
        clinicalCount += 3;
    }
    counts.expedientes = clinicalCount;

    let vaccineCount = 0;
    for (let i = 0; i < vaccineNames.length; i += 1) {
        await client.query(`
            INSERT INTO vacunas_protocolos (tenant_id,nombre,especie,edad_inicial_dias,intervalo_dias,dosis_totales,id_medicamento)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (tenant_id,nombre,especie) DO UPDATE SET activo=TRUE
        `, [tenantId, vaccineNames[i], i < 3 || i === 6 ? 'Canino' : 'Felino', i < 2 ? 42 : 84, 365, 1, pick(vaccineProductCodes, i)]);
        vaccineCount += 1;
    }
    const protocolRows = await client.query('SELECT id_protocolo, nombre, id_medicamento FROM vacunas_protocolos WHERE tenant_id=$1 ORDER BY id_protocolo', [tenantId]);
    for (let i = 0; i < 20; i += 1) {
        const patient = pick(patientIds, i);
        const protocol = pick(protocolRows.rows, i);
        const applied = addDays(new Date(), -(i * 9 + 7));
        const nextDose = addDays(new Date(), 60 + i * 8);
        const lot = await client.query('SELECT id_lote FROM lotes_medicamento WHERE tenant_id=$1 AND id_medicamento=$2 ORDER BY fecha_vencimiento LIMIT 1', [tenantId, protocol.id_medicamento]);
        const inserted = await client.query(`
            INSERT INTO vacunas_aplicadas (tenant_id,id_paciente,id_protocolo,id_medicamento,id_lote,nombre_vacuna,fecha_aplicacion,proxima_dosis,veterinario,notas)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Registro demo de medicina preventiva')
            RETURNING id_vacuna_aplicada
        `, [tenantId, patient.id, protocol.id_protocolo, protocol.id_medicamento, lot.rows[0]?.id_lote || null, protocol.nombre, applied, nextDose, pick(vetUserIds, i)]);
        await client.query(`
            INSERT INTO recordatorios (tenant_id,tipo,referencia_tabla,referencia_id,id_tutor,id_paciente,correo_destino,asunto,cuerpo,fecha_programada)
            VALUES ($1,'vacuna_proxima','vacunas_aplicadas',$2,$3,$4,$5,$6,$7,($8::date - INTERVAL '7 days'))
            ON CONFLICT (tenant_id,tipo,referencia_tabla,referencia_id,fecha_programada) DO NOTHING
        `, [
            tenantId, inserted.rows[0].id_vacuna_aplicada, patient.tutor, patient.id,
            `${patient.tutor.toLowerCase()}@demo.local`, `Proxima vacuna de ${pick(petNames, i)}`,
            `Recordatorio preventivo para ${pick(petNames, i)}: ${protocol.nombre}.`, nextDose
        ]);
        vaccineCount += 2;
    }
    counts.vacunas = vaccineCount;

    let salesCount = 0;
    for (let i = 0; i < 20; i += 1) {
        const patient = pick(patientIds, i);
        const service = pick(serviceRows.rows, i);
        const product = pick(productCodes, i);
        const total = money(Number(service.precio) + Number(product.sale));
        const saleId = `${DEMO_PREFIX}-VENTA-${clinicIndex + 1}-${String(i + 1).padStart(3, '0')}`;
        await client.query(`
            INSERT INTO ventas (codVenta,fecha,codVendedor,identidadCliente,total,estado,tipoCompra,isv,descuento,idCaja,tenant_id,id_paciente)
            VALUES ($1,NOW() - ($2 || ' days')::interval,$3,$4,$5,'Completada','Contado',0,0,$6,$7,$8)
            ON CONFLICT (codVenta) DO UPDATE SET total=EXCLUDED.total, tenant_id=EXCLUDED.tenant_id
        `, [saleId, i, receptionEmail, patient.tutor, total, `${DEMO_PREFIX}-CAJA-${clinicIndex + 1}`, tenantId, patient.id]);
        await client.query(`
            INSERT INTO detalleventa (codDetalleventa,idVenta,producto,cantidad,precioUnitario,tipoProducto,id_servicio,tipo_isv,subtotal_exento,tenant_id)
            VALUES ($1,$2,$3,1,$4,'SERVICIO',$5,'exento',$4,$6)
            ON CONFLICT (codDetalleventa) DO UPDATE SET precioUnitario=EXCLUDED.precioUnitario, tenant_id=EXCLUDED.tenant_id
        `, [`${DEMO_PREFIX}-DET-S-${clinicIndex + 1}-${String(i + 1).padStart(3, '0')}`, saleId, service.nombre, service.precio, service.id_servicio, tenantId]);
        await client.query(`
            INSERT INTO detalleventa (codDetalleventa,idVenta,producto,cantidad,precioUnitario,tipoProducto,id_presentacion,tipo_isv,subtotal_exento,tenant_id)
            VALUES ($1,$2,$3,1,$4,'MEDICAMENTO',$5,'exento',$4,$6)
            ON CONFLICT (codDetalleventa) DO UPDATE SET precioUnitario=EXCLUDED.precioUnitario, tenant_id=EXCLUDED.tenant_id
        `, [`${DEMO_PREFIX}-DET-M-${clinicIndex + 1}-${String(i + 1).padStart(3, '0')}`, saleId, product.code, product.sale, product.presId, tenantId]);
        salesCount += 3;
    }
    counts.ventas = salesCount;

    return { tenantId, clinic: clinic.name, counts };
}

async function main() {
    if (!process.env.DATABASE_URL && !process.env.DB_INTERNAL_URL) {
        throw new Error('Falta DATABASE_URL o DB_INTERNAL_URL en el entorno.');
    }

    await runMigrations(pool);

    const existing = await pool.query("SELECT COUNT(*)::int AS count FROM pacientes WHERE microchip LIKE 'DEMO-VET-%'");
    if (existing.rows[0].count > 0 && !FORCE) {
        console.log(`Ya existen ${existing.rows[0].count} pacientes demo. Usa --force solo si quieres agregar otro lote.`);
        return;
    }

    const client = await pool.connect();
    const results = [];
    try {
        await client.query('BEGIN');
        for (let i = 0; i < clinics.length; i += 1) {
            results.push(await seedClinic(client, clinics[i], i));
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    const totals = {};
    for (const result of results) {
        for (const [key, value] of Object.entries(result.counts)) {
            totals[key] = (totals[key] || 0) + value;
        }
    }
    const totalRecords = Object.values(totals).reduce((sum, value) => sum + value, 0);
    console.log('Seed veterinario completado.');
    console.log(JSON.stringify({ clinics: results.map(r => r.clinic), totals, totalRecords, adminPassword: ADMIN_PASSWORD }, null, 2));
}

main()
    .catch((error) => {
        console.error('Error sembrando datos demo:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
