import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { Link, router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [legalModal, setLegalModal] = useState<null | 'terminos' | 'privacidad'>(null);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/(tabs)/');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Rentalova</Text>
        <Text style={styles.subtitle}>Inicia sesión en tu cuenta</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>

        <View style={styles.legalRow}>
          <Text style={styles.legalText}>
            Al continuar aceptas nuestros{' '}
            <Text style={styles.legalLink} onPress={() => setLegalModal('terminos')}>
              Términos y condiciones
            </Text>
            {' '}y{' '}
            <Text style={styles.legalLink} onPress={() => setLegalModal('privacidad')}>
              Política de privacidad
            </Text>
          </Text>
        </View>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.linkRow}>
            <Text style={styles.linkText}>
              ¿No tienes cuenta? <Text style={styles.linkAccent}>Regístrate</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>

      <Modal visible={legalModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLegalModal(null)}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {legalModal === 'terminos' ? 'Términos y condiciones' : 'Política de privacidad'}
          </Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {legalModal === 'terminos' ? (
              <>
                <Text style={styles.mlH1}>Términos de Servicio</Text>

                <Text style={styles.mlH2}>1. Introducción</Text>
                <Text style={styles.mlP}>Este sitio web es operado por Rentalova. Los términos «nosotros», «nos», «nuestro» y «nuestra» se refieren a Rentalova. Rentalova ofrece este sitio web, incluyendo toda la información, herramientas y servicios disponibles en él, a ti, el usuario, condicionado a la aceptación de todos los términos, condiciones, políticas y avisos aquí establecidos.</Text>
                <Text style={styles.mlP}>Al visitar nuestro sitio y/o utilizar nuestros servicios de alquiler de objetos entre particulares, participas en nuestro «Servicio» y aceptas estar sujeto a los siguientes términos y condiciones («Términos de Servicio», «Términos»), incluyendo cualquier término, condición y política adicional referenciado aquí y/o disponible mediante hipervínculos. Estos Términos de Servicio se aplican a todos los usuarios del sitio, incluyendo, sin limitación, usuarios que navegan, arrendadores (propietarios de objetos), arrendatarios (usuarios que alquilan objetos), y/o contribuyentes de contenido.</Text>

                <Text style={styles.mlH2}>2. Aceptación de los términos</Text>
                <Text style={styles.mlP}>Por favor, lee estos Términos de Servicio cuidadosamente antes de acceder o utilizar nuestro sitio web. Al acceder o utilizar cualquier parte del sitio, aceptas estar sujeto a estos Términos de Servicio. Si no estás de acuerdo con todos los términos y condiciones aquí establecidos, entonces no puedes acceder al sitio web ni utilizar ninguno de los servicios.</Text>

                <Text style={styles.mlH2}>3. Modificaciones de los términos</Text>
                <Text style={styles.mlP}>Las nuevas funciones o herramientas que se añadan a la plataforma actual también estarán sujetas a los Términos de Servicio. Puedes revisar la versión más reciente de los Términos de Servicio en cualquier momento en esta página. Nos reservamos el derecho de actualizar, cambiar o reemplazar cualquier parte de estos Términos de Servicio publicando actualizaciones y/o cambios en nuestro sitio web.</Text>
                <Text style={styles.mlP}>Es tu responsabilidad revisar esta página periódicamente para conocer cualquier modificación. El uso continuo del sitio web o el acceso al mismo después de la publicación de cualquier cambio constituye la aceptación de dichos cambios.</Text>

                <Text style={styles.mlH2}>4. Descripción del servicio</Text>
                <Text style={styles.mlP}>Rentalova es una plataforma peer-to-peer que permite a particulares (arrendadores) publicar objetos para alquilar a otros usuarios (arrendatarios) de forma temporal. Nuestra plataforma facilita la conexión entre ambas partes, pero no somos propietarios de los objetos ni intermediarios directos en la transacción de alquiler.</Text>
                <Text style={styles.mlP}>Servicios incluidos:{'\n'}• Publicación de objetos disponibles para alquiler{'\n'}• Sistema de búsqueda y filtrado de objetos{'\n'}• Gestión de contratos de alquiler entre usuarios{'\n'}• Sistema de verificación de identidad (DNI/NIE){'\n'}• Herramientas de comunicación entre arrendadores y arrendatarios</Text>

                <Text style={styles.mlH2}>5. Condiciones de uso de la plataforma</Text>
                <Text style={styles.mlH3}>5.1 Responsabilidad de los usuarios</Text>
                <Text style={styles.mlP}>Los usuarios se comprometen a utilizar la plataforma de manera responsable y conforme a la legislación vigente. Tanto arrendadores como arrendatarios son responsables de cumplir con los términos del contrato de alquiler que establezcan entre ellos.</Text>
                <Text style={styles.mlH3}>5.2 Verificación de identidad</Text>
                <Text style={styles.mlP}>Para utilizar los servicios de Rentalova, los usuarios deben completar el proceso de verificación de identidad mediante la carga de documentos oficiales (DNI o NIE) y una fotografía tipo selfie. Esta información se utiliza exclusivamente para verificar la identidad del usuario y garantizar la seguridad de las transacciones.</Text>
                <Text style={styles.mlH3}>5.3 Objetos prohibidos</Text>
                <Text style={styles.mlP}>No se permite la publicación de objetos que:{'\n'}• Sean ilegales o estén prohibidos por la legislación española{'\n'}• Requieran licencias especiales sin la debida acreditación{'\n'}• Puedan suponer un peligro para la salud o seguridad{'\n'}• Infrinjan derechos de propiedad intelectual o industrial de terceros{'\n'}• Sean falsificaciones o copias no autorizadas</Text>

                <Text style={styles.mlH2}>6. Responsabilidades de Rentalova</Text>
                <Text style={styles.mlH3}>6.1 Facilitador de la plataforma</Text>
                <Text style={styles.mlP}>Rentalova actúa como facilitador de la plataforma que permite la conexión entre arrendadores y arrendatarios. No somos propietarios de los objetos publicados ni somos parte del contrato de alquiler entre usuarios.</Text>
                <Text style={styles.mlH3}>6.2 Limitación de responsabilidad</Text>
                <Text style={styles.mlP}>Rentalova no se hace responsable de:{'\n'}• La calidad, estado o funcionamiento de los objetos alquilados{'\n'}• El cumplimiento de los términos del contrato entre arrendador y arrendatario{'\n'}• Daños, pérdidas o robos de objetos durante el periodo de alquiler{'\n'}• Disputas entre usuarios relacionadas con el alquiler{'\n'}• La veracidad de la información proporcionada por los usuarios{'\n'}• El contrato de alquiler, que es un modelo orientativo y las partes podrán formalizar otro diferente si así lo estiman conveniente</Text>
                <Text style={styles.mlP}>Sin embargo, haremos nuestro mejor esfuerzo para mediar en conflictos y ayudar a resolver disputas entre usuarios.</Text>

                <Text style={styles.mlH2}>7. Contratos de alquiler</Text>
                <Text style={styles.mlP}>Los contratos de alquiler generados a través de nuestra plataforma son vinculantes entre el arrendador y el arrendatario. Cada contrato incluye:{'\n'}• Descripción del objeto{'\n'}• Precio y duración del alquiler{'\n'}• Importe del depósito (fianza){'\n'}• Condiciones de uso y devolución{'\n'}• Datos de identificación de ambas partes</Text>
                <Text style={styles.mlP}>Ambas partes deben revisar y aceptar el contrato antes de proceder con el alquiler. La aceptación del contrato queda registrada con fecha y hora.</Text>

                <Text style={styles.mlH2}>8. Pagos y depósitos</Text>
                <Text style={styles.mlH3}>8.1 Gestión de pagos</Text>
                <Text style={styles.mlP}>Los pagos por el alquiler de objetos se realizan directamente entre arrendador y arrendatario mediante los métodos de pago acordados entre ambas partes. Rentalova no gestiona los pagos en la fase MVP de la plataforma.</Text>
                <Text style={styles.mlH3}>8.2 Depósitos de seguridad</Text>
                <Text style={styles.mlP}>El arrendador puede solicitar un depósito de seguridad (fianza) para cubrir posibles daños o pérdidas del objeto. El importe del depósito será establecido por el arrendador en el momento de publicar el objeto. El depósito debe ser devuelto por el arrendador al arrendatario una vez finalizado el alquiler, siempre que el objeto sea devuelto en las mismas condiciones en que fue entregado.</Text>

                <Text style={styles.mlH2}>9. Propiedad intelectual</Text>
                <Text style={styles.mlP}>El contenido de este sitio web, incluyendo, pero no limitado a, textos, gráficos, logotipos, iconos, imágenes, clips de audio, descargas digitales y compilaciones de datos, es propiedad de Rentalova o de sus proveedores de contenido y está protegido por las leyes de propiedad intelectual e industrial españolas e internacionales.</Text>

                <Text style={styles.mlH2}>10. Protección de datos</Text>
                <Text style={styles.mlP}>El tratamiento de los datos personales de los usuarios se realiza de acuerdo con nuestra Política de Privacidad y en cumplimiento con el Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).</Text>

                <Text style={styles.mlH2}>11. Cancelación y suspensión de cuentas</Text>
                <Text style={styles.mlP}>Rentalova se reserva el derecho de suspender o cancelar cuentas de usuarios que:{'\n'}• Incumplan estos Términos de Servicio{'\n'}• Proporcionen información falsa o fraudulenta{'\n'}• Utilicen la plataforma para actividades ilegales{'\n'}• Abusen del sistema o intenten manipularlo{'\n'}• Reciban múltiples quejas fundamentadas de otros usuarios</Text>

                <Text style={styles.mlH2}>12. Legislación aplicable y jurisdicción</Text>
                <Text style={styles.mlP}>Estos Términos de Servicio se rigen por la legislación española. Cualquier disputa derivada de estos términos se someterá a la jurisdicción de los juzgados y tribunales de Madrid, España, salvo que la legislación aplicable establezca lo contrario.</Text>

                <Text style={styles.mlH2}>13. Información de contacto</Text>
                <Text style={styles.mlP}>Si tienes preguntas sobre estos Términos de Servicio o necesitas asistencia, puedes contactarnos en:{'\n'}• Email: info.rentalova@gmail.com{'\n'}• Teléfono: 626 14 98 86{'\n'}• Dirección: Calle Hileras 18, 28013 Madrid</Text>

                <Text style={styles.mlH2}>14. Disposiciones generales</Text>
                <Text style={styles.mlP}>Si alguna disposición de estos Términos de Servicio se considera inválida o no aplicable, dicha disposición se interpretará de manera que refleje la intención original de las partes, y las disposiciones restantes permanecerán en pleno vigor y efecto.</Text>
                <Text style={styles.mlP}>El hecho de que Rentalova no ejerza o haga cumplir cualquier derecho o disposición de estos Términos de Servicio no constituirá una renuncia a dicho derecho o disposición.</Text>
              </>
            ) : (
              <>
                <Text style={styles.mlH1}>Política de Privacidad</Text>
                <Text style={styles.mlUpdated}>Última actualización: 26 de mayo de 2025</Text>
                <Text style={styles.mlP}>Esta Política de Privacidad describe cómo Rentalova, gestionada por ASOCIACIÓN JUNIOR EMPRESA SYNKRO (NIF: G75285965; VAT/ROI: ESG75285965), recopila, utiliza y divulga su información personal al visitar o utilizar nuestros servicios.</Text>

                <Text style={styles.mlH2}>1. Cambios en la presente Política de Privacidad</Text>
                <Text style={styles.mlP}>Esta Política de Privacidad podrá actualizarse puntualmente para reflejar cambios en nuestras prácticas o por razones operativas, legales o normativas. Publicaremos la versión revisada en el Sitio, actualizaremos la fecha de «Última actualización» y tomaremos las medidas adicionales que pueda exigir la ley aplicable.</Text>

                <Text style={styles.mlH2}>2. Recopilación y utilización de su información personal</Text>
                <Text style={styles.mlH3}>2.1. Información que recopilamos directamente de usted</Text>
                <Text style={styles.mlP}>La información que nos envía directamente puede incluir:{'\n'}• Datos de contacto: nombre, dirección, número de teléfono y correo electrónico.{'\n'}• Información de la cuenta: nombre de usuario, contraseña y datos de seguridad.{'\n'}• Información de publicaciones: descripción, fotografías y condiciones de los artículos.{'\n'}• Información de transacciones: datos de facturación y detalles de los alquileres.{'\n'}• Documentación de identidad y garantías para verificar su identidad.{'\n'}• Información de atención al cliente.</Text>
                <Text style={styles.mlH3}>2.2. Información que recopilamos sobre su uso</Text>
                <Text style={styles.mlP}>Podemos recopilar automáticamente cierta información sobre su interacción con los Servicios («Datos de uso»), utilizando cookies, píxeles y tecnologías similares. Los Datos de uso pueden incluir información del dispositivo, del navegador, dirección IP, páginas visitadas y otras interacciones con el Sitio.</Text>
                <Text style={styles.mlH3}>2.3. Información que obtenemos de terceros</Text>
                <Text style={styles.mlP}>Podemos obtener información sobre usted de: proveedores de infraestructura tecnológica, procesadores de pago, proveedores de seguros y servicios de gestión de depósitos, y plataformas de terceros cuando interactúa con nuestros anuncios.</Text>

                <Text style={styles.mlH2}>3. Utilización de su información personal</Text>
                <Text style={styles.mlH3}>3.1. Prestación del servicio de alquiler P2P</Text>
                <Text style={styles.mlP}>Usamos su información para facilitar los alquileres entre particulares: gestionar el proceso de reserva, procesar pagos y depósitos, enviar notificaciones sobre transacciones, gestionar reclamaciones y resolver disputas entre usuarios, y administrar el seguro cuando corresponda.</Text>
                <Text style={styles.mlH3}>3.2. Gestión de la cuenta</Text>
                <Text style={styles.mlP}>Utilizamos su información para crear y mantener su cuenta de usuario, verificar su identidad y garantizar la seguridad de la Plataforma.</Text>
                <Text style={styles.mlH3}>3.3. Marketing y publicidad</Text>
                <Text style={styles.mlP}>Podemos utilizar su información para enviarle comunicaciones promocionales por correo electrónico u otros canales. La base legal para estas actividades es nuestro interés legítimo en la promoción de nuestros servicios, conforme al art. 6(1)(f) del RGPD. Puede darse de baja en cualquier momento.</Text>
                <Text style={styles.mlH3}>3.4. Seguridad y prevención del fraude</Text>
                <Text style={styles.mlP}>Utilizamos su información para detectar e investigar actividades fraudulentas, garantizar la integridad de las transacciones y proteger a los usuarios de la Plataforma, conforme al art. 6(1)(f) del RGPD.</Text>
                <Text style={styles.mlH3}>3.5. Mejora del servicio y comunicaciones</Text>
                <Text style={styles.mlP}>Utilizamos su información para prestar atención al cliente, mejorar la experiencia de usuario y mantener nuestra relación comercial con usted, conforme al art. 6(1)(f) del RGPD.</Text>

                <Text style={styles.mlH2}>4. Cookies</Text>
                <Text style={styles.mlP}>Rentalova utiliza cookies y tecnologías similares para operar y mejorar el Sitio, recordar sus preferencias y elaborar estadísticas de uso. También podemos permitir que terceros utilicen cookies en nuestro Sitio para personalizar la publicidad.</Text>

                <Text style={styles.mlH2}>5. Divulgación de su información personal</Text>
                <Text style={styles.mlP}>En determinadas circunstancias, podemos divulgar su información personal a:{'\n'}• Proveedores de servicios tecnológicos, procesadores de pago y proveedores de seguros.{'\n'}• Socios comerciales y de marketing.{'\n'}• Otros usuarios de la Plataforma, en la medida necesaria para completar las transacciones.{'\n'}• Autoridades competentes, cuando así lo exija la ley.{'\n'}• Entidades vinculadas a Rentalova.{'\n'}• En el contexto de fusiones, adquisiciones u otras transacciones corporativas.</Text>

                <Text style={styles.mlH2}>6. Contenido generado por usuarios</Text>
                <Text style={styles.mlP}>La Plataforma permite a los usuarios publicar anuncios de artículos, valoraciones y reseñas. Dicho contenido será público y accesible para cualquier persona. No somos responsables de la privacidad o seguridad de la información que usted decida hacer pública.</Text>

                <Text style={styles.mlH2}>7. Sitios web y enlaces de terceros</Text>
                <Text style={styles.mlP}>El Sitio puede contener enlaces a plataformas de terceros. No somos responsables de las prácticas de privacidad o seguridad de dichos sitios. Le recomendamos que revise sus políticas de privacidad antes de facilitar cualquier dato personal.</Text>

                <Text style={styles.mlH2}>8. Protección de menores</Text>
                <Text style={styles.mlP}>Los Servicios no están destinados a menores de 18 años. No recopilamos intencionadamente información personal de menores. Si tiene conocimiento de que un menor nos ha proporcionado sus datos, puede solicitarnos su eliminación.</Text>

                <Text style={styles.mlH2}>9. Seguridad y conservación de la información</Text>
                <Text style={styles.mlP}>Aplicamos medidas técnicas y organizativas razonables para proteger su información personal. Sin embargo, ningún sistema de seguridad es infalible. El período de conservación de su información depende de factores como la vigencia de su cuenta, obligaciones legales aplicables o la resolución de disputas.</Text>

                <Text style={styles.mlH2}>10. Sus derechos</Text>
                <Text style={styles.mlP}>En virtud de la normativa aplicable (incluido el RGPD), usted puede ejercer los siguientes derechos:{'\n'}• Derecho de acceso: conocer qué información tenemos sobre usted.{'\n'}• Derecho de rectificación: corregir datos inexactos o incompletos.{'\n'}• Derecho de supresión: solicitar la eliminación de sus datos.{'\n'}• Derecho de portabilidad: recibir sus datos en formato estructurado.{'\n'}• Derecho de oposición: oponerse al tratamiento basado en nuestro interés legítimo.{'\n'}• Derecho de limitación: solicitar la restricción del tratamiento.{'\n'}• Derecho a retirar el consentimiento en cualquier momento.{'\n'}• Derecho de apelación ante la Agencia Española de Protección de Datos (AEPD).</Text>

                <Text style={styles.mlH2}>11. Reclamaciones</Text>
                <Text style={styles.mlP}>Si tiene alguna reclamación sobre cómo tratamos su información personal, puede contactarnos directamente. Si no queda satisfecho con nuestra respuesta, tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD), con sede en C/ Jorge Juan, 6, 28001 Madrid (www.aepd.es).</Text>

                <Text style={styles.mlH2}>12. Usuarios internacionales y transferencias de datos</Text>
                <Text style={styles.mlP}>Su información personal puede ser transferida, almacenada y tratada fuera del país en el que reside. En caso de transferencias fuera del Espacio Económico Europeo, utilizaremos mecanismos de transferencia reconocidos por la normativa aplicable, como las Cláusulas Contractuales Estándar aprobadas por la Comisión Europea.</Text>

                <Text style={styles.mlH2}>13. Contacto</Text>
                <Text style={styles.mlP}>Si tiene alguna pregunta o desea ejercer sus derechos, puede contactarnos:{'\n'}• Entidad: ASOCIACIÓN JUNIOR EMPRESA SYNKRO{'\n'}• NIF: G75285965 | VAT/ROI: ESG75285965{'\n'}• Dirección: Plaza de San Martín, 1, 28013 Madrid, España{'\n'}• Web: rentalova.com</Text>

                <Text style={[styles.mlP, { textAlign: 'center', marginTop: 24 }]}>© 2025 Rentalova · ASOCIACIÓN JUNIOR EMPRESA SYNKRO · rentalova.com</Text>
              </>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setLegalModal(null)}>
            <Text style={styles.modalCloseBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: '#4b9c78',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 14,
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#4b9c78',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  legalRow: { marginTop: 16, paddingHorizontal: 8 },
  legalText: { fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 17 },
  legalLink: { color: '#4b9c78', fontWeight: '600' },
  linkRow: {
    marginTop: 20,
  },
  linkText: {
    fontSize: 14,
    color: '#6b7280',
  },
  linkAccent: {
    color: '#4b9c78',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  mlH1: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  mlH2: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    marginTop: 20,
  },
  mlH3: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 14,
  },
  mlP: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 10,
  },
  mlUpdated: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 20,
  },
  modalCloseBtn: {
    margin: 16,
    height: 52,
    backgroundColor: '#4b9c78',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
