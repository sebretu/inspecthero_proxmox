"use client";
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  const { t, language } = useLanguage();

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--ui-card, #1a1a2e)",
          borderRadius: 24,
          padding: 32,
          width: "min(680px, 96vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          border: "1px solid var(--ui-border, rgba(255,255,255,0.1))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ui-border, rgba(255,255,255,0.1))", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg, #3b82f6, #0ea5e9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>
              🛡️
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--ui-text, #fff)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {language === "pl" ? "Polityka Prywatności" : language === "de" ? "Datenschutzerklärung" : "Privacy Policy"}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--ui-muted, #888)", fontSize: 22, cursor: "pointer", padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div style={{
          overflowY: "auto",
          paddingRight: 8,
          fontSize: 14,
          lineHeight: "1.6",
          color: "var(--ui-text, #fff)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          {language === "pl" && (
            <>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>1. Informacje ogólne</h4>
              <p style={{ margin: 0 }}>Niniejsza Polityka Prywatności określa zasady przetwarzania danych osobowych użytkowników serwisu et4u.de (dalej: „Serwis”).</p>
              <p style={{ margin: 0 }}>Administratorem danych osobowych jest właściciel serwisu ET⚡U.DE (dalej: „Administrator”).</p>
              <p style={{ margin: 0 }}>W sprawach dotyczących danych osobowych można skontaktować się z Administratorem za pośrednictwem adresu e-mail: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>2. Zakres przetwarzanych danych</h4>
              <p style={{ margin: 0 }}>Administrator może przetwarzać następujące dane:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>imię i nazwisko,</li>
                <li>adres e-mail,</li>
                <li>dane przypisanego konta użytkownika,</li>
                <li>adres IP,</li>
                <li>informacje o logowaniu,</li>
                <li>dane techniczne urządzenia i przeglądarki,</li>
                <li>pliki cookies sesyjne.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>3. Cel przetwarzania danych</h4>
              <p style={{ margin: 0 }}>Dane osobowe są przetwarzane w celu:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>umożliwienia logowania i korzystania z Serwisu,</li>
                <li>zarządzania kontami użytkowników,</li>
                <li>zapewnienia bezpieczeństwa systemu,</li>
                <li>obsługi technicznej i kontaktu z użytkownikami,</li>
                <li>wykrywania nadużyć i zabezpieczenia Serwisu,</li>
                <li>realizacji obowiązków wynikających z przepisów prawa.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>4. Podstawa prawna przetwarzania</h4>
              <p style={{ margin: 0 }}>Dane przetwarzane są zgodnie z art. 6 ust. 1 lit.:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li><strong>b RODO</strong> – w celu realizacji dostępu do Serwisu,</li>
                <li><strong>c RODO</strong> – w celu realizacji obowiązków prawnych,</li>
                <li><strong>f RODO</strong> – na podstawie uzasadnionego interesu Administratora, w szczególności w zakresie bezpieczeństwa i utrzymania Serwisu.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>5. Dostęp do Serwisu</h4>
              <p style={{ margin: 0 }}>Konta użytkowników tworzone są wyłącznie przez Administratora. Serwis nie umożliwia samodzielnej rejestracji użytkowników.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>6. Odbiorcy danych</h4>
              <p style={{ margin: 0 }}>Dane mogą być przekazywane podmiotom wspierającym działanie Serwisu, takim jak dostawcy hostingu, dostawcy usług IT oraz podmioty świadczące usługi bezpieczeństwa i utrzymania infrastruktury. Dane nie są sprzedawane osobom trzecim.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>7. Okres przechowywania danych</h4>
              <p style={{ margin: 0 }}>Dane przechowywane są przez okres korzystania z konta użytkownika, niezbędny do zapewnienia bezpieczeństwa i ciągłości działania Serwisu oraz wymagany przez obowiązujące przepisy prawa.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>8. Prawa użytkownika</h4>
              <p style={{ margin: 0 }}>Użytkownik ma prawo do dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, wniesienia sprzeciwu wobec przetwarzania, przenoszenia danych oraz wniesienia skargi do właściwego organu nadzorczego.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>9. Cookies</h4>
              <p style={{ margin: 0 }}>Serwis może wykorzystywać techniczne pliki cookies niezbędne do prawidłowego działania i utrzymania sesji logowania. Jeżeli w Serwisie wykorzystywane są dodatkowe narzędzia analityczne lub marketingowe, użytkownik może zostać poproszony o wyrażenie zgody na wykorzystanie odpowiednich plików cookies.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>10. Bezpieczeństwo danych</h4>
              <p style={{ margin: 0 }}>Administrator stosuje odpowiednie środki techniczne i organizacyjne mające na celu ochronę danych osobowych przed nieuprawnionym dostępem, utratą lub zniszczeniem.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>11. Zmiany polityki prywatności</h4>
              <p style={{ margin: 0 }}>Administrator zastrzega sobie prawo do aktualizacji niniejszej Polityki Prywatności. Aktualna wersja będzie publikowana w Serwisie.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>12. Kontakt</h4>
              <p style={{ margin: 0 }}>W sprawach związanych z przetwarzaniem danych osobowych prosimy o kontakt pod adresem e-mail: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>
            </>
          )}

          {language === "de" && (
            <>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>1. Allgemeine Informationen</h4>
              <p style={{ margin: 0 }}>Diese Datenschutzerklärung legt die Regeln für die Verarbeitung personenbezogener Daten von Nutzern der Website et4u.de (nachfolgend: „Website“) fest.</p>
              <p style={{ margin: 0 }}>Verantwortlicher für die Verarbeitung personenbezogener Daten ist der Eigentümer der Website ET⚡U.DE (nachfolgend: „Administrator“).</p>
              <p style={{ margin: 0 }}>In Angelegenheiten des Datenschutzes können Sie den Administrator per E-Mail kontaktieren: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>2. Umfang der verarbeiteten Daten</h4>
              <p style={{ margin: 0 }}>Der Administrator kann folgende Daten verarbeiten:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>Vor- und Nachname,</li>
                <li>E-Mail-Adresse,</li>
                <li>Details des zugewiesenen Benutzerkontos,</li>
                <li>IP-Adresse,</li>
                <li>Anmeldeinformationen,</li>
                <li>technische Daten des Geräts und des Browsers,</li>
                <li>Sitzungs-Cookies.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>3. Zweck der Datenverarbeitung</h4>
              <p style={{ margin: 0 }}>Personenbezogene Daten werden zu folgenden Zwecken verarbeitet:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>Ermöglichung der Anmeldung und Nutzung der Website,</li>
                <li>Verwaltung von Benutzerkonten,</li>
                <li>Gewährleistung der Systemsicherheit,</li>
                <li>technischer Support und Kontakt mit den Nutzern,</li>
                <li>Erkennung von Missbrauch und Sicherung der Website,</li>
                <li>Erfüllung gesetzlicher Pflichten.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>4. Rechtsgrundlage für die Verarbeitung</h4>
              <p style={{ margin: 0 }}>Die Datenverarbeitung erfolgt gemäß Art. 6 Abs. 1 lit.:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li><strong>b DSGVO</strong> – zur Durchführung des Zugangs zur Website,</li>
                <li><strong>c DSGVO</strong> – zur Erfüllung rechtlicher Verpflichtungen,</li>
                <li><strong>f DSGVO</strong> – basierend auf dem berechtigten Interesse des Administrators, insbesondere im Bereich der Sicherheit und Wartung der Website.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>5. Zugang zur Website</h4>
              <p style={{ margin: 0 }}>Benutzerkonten werden ausschließlich vom Administrator erstellt. Die Website ermöglicht keine selbstständige Registrierung von Nutzern.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>6. Empfänger der Daten</h4>
              <p style={{ margin: 0 }}>Daten können an Partner weitergegeben werden, die den Betrieb der Website unterstützen, wie Hosting-Anbieter, IT-Dienstleister sowie Dienstleister für Infrastruktursicherheit und -wartung. Daten werden nicht an Dritte verkauft.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>7. Aufbewahrungsfrist der Daten</h4>
              <p style={{ margin: 0 }}>Daten werden für den Zeitraum der Nutzung des Benutzerkontos gespeichert, der zur Gewährleistung der Sicherheit und des kontinuierlichen Betriebs der Website erforderlich und gesetzlich vorgeschrieben ist.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>8. Rechte des Nutzers</h4>
              <p style={{ margin: 0 }}>Der Nutzer hat das Recht auf Auskunft über seine Daten, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch gegen die Verarbeitung, Datenübertragbarkeit und Beschwerde bei der zuständigen Aufsichtsbehörde.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>9. Cookies</h4>
              <p style={{ margin: 0 }}>Die Website kann technische Cookies verwenden, die für das ordnungsgemäße Funktionieren und die Aufrechterhaltung der Anmeldesitzung erforderlich sind. Falls zusätzliche Analyse- oder Marketing-Tools auf der Website verwendet werden, kann der Nutzer gebeten werden, der Verwendung entsprechender Cookies zuzustimmen.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>10. Datensicherheit</h4>
              <p style={{ margin: 0 }}>Der Administrator wendet angemessene technische und organisatorische Maßnahmen an, um personenbezogene Daten vor unbefugtem Zugriff, Verlust oder Zerstörung zu schützen.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>11. Änderungen der Datenschutzerklärung</h4>
              <p style={{ margin: 0 }}>Der Administrator behält sich das Recht vor, diese Datenschutzerklärung zu aktualisieren. Die aktuelle Version wird auf der Website veröffentlicht.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>12. Kontakt</h4>
              <p style={{ margin: 0 }}>In Angelegenheiten der Verarbeitung personenbezogener Daten kontaktieren Sie uns bitte per E-Mail unter: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>
            </>
          )}

          {language !== "pl" && language !== "de" && (
            <>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>1. General Information</h4>
              <p style={{ margin: 0 }}>This Privacy Policy defines the rules for processing personal data of users of the et4u.de website (hereinafter: "Website").</p>
              <p style={{ margin: 0 }}>The administrator of personal data is the owner of the ET⚡U.DE website (hereinafter: "Administrator").</p>
              <p style={{ margin: 0 }}>In matters regarding personal data, you can contact the Administrator via e-mail: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>2. Scope of processed data</h4>
              <p style={{ margin: 0 }}>The Administrator may process the following data:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>first name and last name,</li>
                <li>e-mail address,</li>
                <li>assigned user account details,</li>
                <li>IP address,</li>
                <li>login information,</li>
                <li>device and browser technical details,</li>
                <li>session cookies.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>3. Purpose of data processing</h4>
              <p style={{ margin: 0 }}>Personal data are processed for the purpose of:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li>enabling login and use of the Website,</li>
                <li>managing user accounts,</li>
                <li>ensuring system security,</li>
                <li>technical support and contact with users,</li>
                <li>detecting abuse and securing the Website,</li>
                <li>fulfilling obligations under the law.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>4. Legal basis for processing</h4>
              <p style={{ margin: 0 }}>Data is processed in accordance with Art. 6 paragraph 1 point:</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                <li><strong>b GDPR</strong> – to provide access to the Website,</li>
                <li><strong>c GDPR</strong> – to fulfill legal obligations,</li>
                <li><strong>f GDPR</strong> – based on the legitimate interest of the Administrator, in particular in the field of security and maintenance of the Website.</li>
              </ul>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>5. Website Access</h4>
              <p style={{ margin: 0 }}>User accounts are created solely by the Administrator. The Website does not allow self-registration of users.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>6. Data recipients</h4>
              <p style={{ margin: 0 }}>Data may be transferred to entities supporting the operation of the Website, such as hosting providers, IT service providers, and entities providing infrastructure security and maintenance services. Data is not sold to third parties.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>7. Data storage period</h4>
              <p style={{ margin: 0 }}>Data is stored for the period of using the user account, necessary to ensure the security and continuity of the Website's operation, and required by applicable law.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>8. User Rights</h4>
              <p style={{ margin: 0 }}>The user has the right to access their data, rectify data, delete data, restrict processing, object to processing, data portability, and lodge a complaint with the competent supervisory authority.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>9. Cookies</h4>
              <p style={{ margin: 0 }}>The Website may use technical cookies necessary for the proper functioning and maintenance of the login session. If additional analytical or marketing tools are used on the Website, the user may be asked to consent to the use of appropriate cookies.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>10. Data security</h4>
              <p style={{ margin: 0 }}>The Administrator applies appropriate technical and organizational measures aimed at protecting personal data against unauthorized access, loss, or destruction.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>11. Changes to privacy policy</h4>
              <p style={{ margin: 0 }}>The Administrator reserves the right to update this Privacy Policy. The current version will be published on the Website.</p>

              <h4 style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0 0", color: "var(--ui-accent, #3b82f6)" }}>12. Contact</h4>
              <p style={{ margin: 0 }}>In matters related to the processing of personal data, please contact us by e-mail at: <a href="mailto:kontakt@et4u.de" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>kontakt@et4u.de</a></p>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--ui-border, rgba(255,255,255,0.1))", paddingTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #3b82f6, #2dd4bf)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {language === "pl" ? "Zamknij" : language === "de" ? "Schließen" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
